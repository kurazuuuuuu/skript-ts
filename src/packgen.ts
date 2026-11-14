/**
 * packgen.ts
 *
 * Generates a Minecraft 1.21.11 resource pack (zip + manifest) from a
 * PackDef built with the definition API in resourcepack.ts. Pure: PNG
 * texture sources are read through the injected `readPngFile` callback,
 * so the module itself never touches the filesystem.
 *
 * Formats pinned against the real 1.21.11 client jar (2026-11-12):
 * - pack.mcmeta carries "min_format" / "max_format" [75, 0] (the
 *   resource pack format of 1.21.11; the legacy lone "pack_format"
 *   number is not used on 1.21.9+).
 * - Item definitions are data-driven: assets/<ns>/items/<path>.json
 *   holds { "model": { "type": "minecraft:model", "model": <id> } }.
 * - Models are { "parent": ..., "textures": { "layer0": <texId> } }.
 * - Font definitions hold bitmap providers
 *   { "type": "bitmap", "file": "<ns>:<path>.png", "height", "ascent",
 *     "chars": [...] }.
 *
 * Output is deterministic: entries are sorted by path, JSON is
 * serialized with fixed indentation, and zip timestamps are pinned to
 * 1980-01-01, so rebuilding an unchanged pack yields the identical
 * SHA-1.
 */

import { createHash } from "node:crypto";
import { deflateRawSync, deflateSync } from "node:zlib";
import {
  parseResourceId,
  type FontCharDef,
  type ItemDef,
  type PackDef,
  type TextureDef,
} from "./resourcepack.js";

/** Resource pack format of the verification base (Paper 1.21.11). */
export const PACK_FORMAT: readonly [number, number] = [75, 0];

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * One generated item, as recorded in the manifest (RP-2). The
 * distribution phase (RP-3) and script-side tooling read this to
 * learn what a stack must carry: the `id` is the `item_model`
 * component value and `customModelData` is the registry number the
 * item's stacks carry in their CustomModelData floats[0].
 */
export interface PackManifestItem {
  /** Resolved item id (`ns:path`); also the item model (`item_model` component target). */
  id: string;
  /** Resolved base item id. */
  baseItem: string;
  /** Resolved model id used in the generated item definition JSON. */
  model: string;
  /** Allocated registry number; omitted when the item has none. */
  customModelData?: number;
}

/** One texture, as recorded in the manifest (RP-5). */
export interface PackManifestTexture {
  /** Resolved texture id (`ns:path`). */
  id: string;
  /** Where the texture came from: a pixel map or a PNG file. */
  source: "pixelmap" | "png";
  width: number;
  height: number;
}

export interface PackManifest {
  namespace: string;
  description: string;
  required: boolean;
  /** File name of the generated zip: `${namespace}.zip`. */
  zipFile: string;
  /** SHA-1 of the whole zip, lowercase hex (the form Paper's API takes). */
  sha1: string;
  /** Zip size in bytes. */
  size: number;
  packFormat: readonly [number, number];
  /** Zip entry paths, sorted. */
  contents: string[];
  /** Generated item manifest entries, in pack declaration order. */
  items: PackManifestItem[];
  /** Texture dimensions, in pack declaration order (RP-5, additive). */
  textures: PackManifestTexture[];
}

/** Sanity range for PNG-source texture dimensions (RP-5). */
export const MAX_PNG_DIMENSION = 4096;

/**
 * Parse a PNG's IHDR chunk and return its dimensions (RP-5).
 * Validates the signature, the presence and shape of IHDR, and
 * that both sides lie in 1..4096 — a sanity range that catches
 * corrupt files early, with a clear build error. Throws on any
 * problem; the message names the context via `where`.
 */
export function pngDimensions(png: Buffer, where = "PNG"): { width: number; height: number } {
  if (
    png.length < PNG_SIGNATURE.length ||
    !png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
  ) {
    fail(`${where}: not a PNG (missing PNG signature)`);
  }
  // Signature (8) + chunk header (8) + IHDR data (13) is the minimum.
  if (png.length < 8 + 8 + 13) {
    fail(`${where}: truncated PNG: file ends before the IHDR chunk is complete`);
  }
  const ihdrLength = png.readUInt32BE(8);
  const ihdrType = png.toString("ascii", 12, 16);
  if (ihdrType !== "IHDR" || ihdrLength !== 13) {
    fail(
      `${where}: invalid PNG: first chunk must be a 13-byte IHDR, got type "${ihdrType}" length ${ihdrLength}`,
    );
  }
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (width < 1 || width > MAX_PNG_DIMENSION) {
    fail(`${where}: PNG width ${width} is outside the sanity range 1..${MAX_PNG_DIMENSION}`);
  }
  if (height < 1 || height > MAX_PNG_DIMENSION) {
    fail(`${where}: PNG height ${height} is outside the sanity range 1..${MAX_PNG_DIMENSION}`);
  }
  return { width, height };
}

export interface GeneratedPack {
  /** Every file inside the zip, keyed by zip path (includes pack.mcmeta). */
  files: ReadonlyMap<string, Buffer>;
  zip: Buffer;
  sha1: string;
  manifest: PackManifest;
}

function fail(message: string): never {
  throw new Error(`packgen: ${message}`);
}

function jsonFile(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function addFile(files: Map<string, Buffer>, path: string, data: Buffer, context: string): void {
  const existing = files.get(path);
  if (existing !== undefined) {
    if (existing.equals(data)) return;
    fail(`conflicting content for zip path "${path}" while adding ${context}`);
  }
  files.set(path, data);
}

function resolvedIdString(id: string, defaultNamespace: string): string {
  const parsed = parseResourceId(id, defaultNamespace);
  return `${parsed.namespace}:${parsed.path}`;
}

/**
 * Collect every texture the pack uses, keyed by resolved id
 * ("namespace:path"). Pack-level textures come first; TextureDef
 * objects referenced inline by items / font chars are collected too.
 * Re-declaring the same resolved id with a different definition
 * object is an error (the same object passed twice is fine).
 */
function collectTextures(pack: PackDef): Map<string, TextureDef> {
  const textures = new Map<string, TextureDef>();
  const add = (tex: TextureDef, where: string): void => {
    const key = resolvedIdString(tex.id, pack.namespace);
    const existing = textures.get(key);
    if (existing !== undefined) {
      if (existing !== tex) {
        fail(
          `${where}: texture id "${tex.id}" (resolved "${key}") is already declared ` +
            `with a different definition; declare it once in the pack's textures`,
        );
      }
      return;
    }
    textures.set(key, tex);
  };
  for (const tex of pack.textures) add(tex, "pack textures");
  for (const item of pack.items) {
    if (item.texture !== undefined && typeof item.texture !== "string") {
      add(item.texture, `item "${item.id}"`);
    }
  }
  for (const fontChar of pack.fontChars) {
    if (typeof fontChar.texture !== "string") {
      add(fontChar.texture, `font char "${fontChar.id}"`);
    }
  }
  return textures;
}

function lookupTexture(
  textures: ReadonlyMap<string, TextureDef>,
  ref: TextureDef | string,
  packNamespace: string,
  where: string,
): TextureDef {
  if (typeof ref !== "string") {
    const key = resolvedIdString(ref.id, packNamespace);
    const found = textures.get(key);
    if (found === undefined) fail(`${where}: texture "${ref.id}" was not collected`);
    return found;
  }
  const key = resolvedIdString(ref, packNamespace);
  const found = textures.get(key);
  if (found === undefined) {
    fail(`${where}: references unknown texture id "${ref}" (resolved "${key}")`);
  }
  return found;
}

export function generatePack(
  pack: PackDef,
  readPngFile: (path: string) => Buffer,
  opts?: {
    /** Registry allocations by resolved item id (`ns:path`), from packregistry. */
    customModelData?: ReadonlyMap<string, number>;
  },
): GeneratedPack {
  const namespace = pack.namespace;
  const textures = collectTextures(pack);
  const files = new Map<string, Buffer>();

  addFile(
    files,
    "pack.mcmeta",
    jsonFile({
      pack: {
        description: pack.description,
        min_format: [...PACK_FORMAT],
        max_format: [...PACK_FORMAT],
      },
    }),
    "pack.mcmeta",
  );

  for (const item of pack.items) {
    addItemFiles(files, textures, item, namespace);
  }

  if (pack.fontChars.length > 0) {
    addFile(
      files,
      `assets/${namespace}/font/default.json`,
      jsonFile({ providers: fontProviders(pack.fontChars, textures, namespace) }),
      "font definition",
    );
  }

  const manifestTextures: PackManifestTexture[] = [];
  for (const tex of textures.values()) {
    const id = parseResourceId(tex.id, namespace);
    const assetPath = `assets/${id.namespace}/textures/${id.path}.png`;
    const info = textureBytes(tex, readPngFile);
    addFile(files, assetPath, info.bytes, `texture "${tex.id}"`);
    manifestTextures.push({
      id: `${id.namespace}:${id.path}`,
      source: info.source,
      width: info.width,
      height: info.height,
    });
  }

  const zip = buildZip(files);
  const sha1 = createHash("sha1").update(zip).digest("hex");
  const manifestItems: PackManifestItem[] = pack.items.map((item) => {
    const itemId = parseResourceId(item.id, namespace);
    const id = `${itemId.namespace}:${itemId.path}`;
    const modelId =
      item.model !== undefined
        ? parseResourceId(item.model, namespace)
        : { namespace: itemId.namespace, path: `item/${itemId.path}` };
    const baseId = parseResourceId(item.baseItem, namespace);
    const customModelData = opts?.customModelData?.get(id);
    return {
      id,
      baseItem: `${baseId.namespace}:${baseId.path}`,
      model: `${modelId.namespace}:${modelId.path}`,
      ...(typeof customModelData === "number" ? { customModelData } : {}),
    };
  });
  const manifest: PackManifest = {
    namespace,
    description: pack.description,
    required: pack.required,
    zipFile: `${namespace}.zip`,
    sha1,
    size: zip.length,
    packFormat: PACK_FORMAT,
    contents: [...files.keys()].sort(),
    items: manifestItems,
    textures: manifestTextures,
  };
  return { files, zip, sha1, manifest };
}

function addItemFiles(
  files: Map<string, Buffer>,
  textures: ReadonlyMap<string, TextureDef>,
  item: ItemDef,
  packNamespace: string,
): void {
  const itemId = parseResourceId(item.id, packNamespace);
  const modelId =
    item.model !== undefined
      ? parseResourceId(item.model, packNamespace)
      : { namespace: itemId.namespace, path: `item/${itemId.path}` };
  const modelIdString = `${modelId.namespace}:${modelId.path}`;

  addFile(
    files,
    `assets/${itemId.namespace}/items/${itemId.path}.json`,
    jsonFile({ model: { type: "minecraft:model", model: modelIdString } }),
    `item "${item.id}" definition`,
  );

  if (item.texture === undefined) return;
  const tex = lookupTexture(textures, item.texture, packNamespace, `item "${item.id}"`);
  const texId = parseResourceId(tex.id, packNamespace);
  addFile(
    files,
    `assets/${modelId.namespace}/models/${modelId.path}.json`,
    jsonFile({
      parent: item.modelParent ?? "minecraft:item/generated",
      textures: { layer0: `${texId.namespace}:${texId.path}` },
    }),
    `item "${item.id}" model`,
  );
}

interface FontProvider {
  type: "bitmap";
  file: string;
  height: number;
  ascent: number;
  chars: string[];
}

function fontProviders(
  fontChars: readonly FontCharDef[],
  textures: ReadonlyMap<string, TextureDef>,
  packNamespace: string,
): FontProvider[] {
  const providers: FontProvider[] = fontChars.map((fontChar) => {
    if (fontChar.char === undefined) {
      fail(
        `font char "${fontChar.id}" has no resolved char; ` +
          `auto-allocated chars are resolved by the project build`,
      );
    }
    const tex = lookupTexture(
      textures,
      fontChar.texture,
      packNamespace,
      `font char "${fontChar.id}"`,
    );
    const texId = parseResourceId(tex.id, packNamespace);
    return {
      type: "bitmap",
      file: `${texId.namespace}:${texId.path}.png`,
      height: fontChar.height,
      ascent: fontChar.ascent,
      chars: [fontChar.char],
    };
  });
  providers.sort((a, b) => (a.chars[0]?.codePointAt(0) ?? 0) - (b.chars[0]?.codePointAt(0) ?? 0));
  return providers;
}

function textureBytes(
  tex: TextureDef,
  readPngFile: (path: string) => Buffer,
): { bytes: Buffer; source: "pixelmap" | "png"; width: number; height: number } {
  if (tex.pixelMap !== undefined) {
    const { width, height, rgba } = pixelMapToRgba(tex);
    return { bytes: encodePng(width, height, rgba), source: "pixelmap", width, height };
  }
  if (tex.pngPath !== undefined) {
    const png = readPngFile(tex.pngPath);
    if (!Buffer.isBuffer(png)) {
      fail(`texture "${tex.id}": readPngFile("${tex.pngPath}") did not return a Buffer`);
    }
    // RP-5: signature + IHDR validation, with dimensions recorded
    // in the manifest. pngDimensions raises the clear errors for
    // signature, truncation, missing IHDR and out-of-range sizes.
    const { width, height } = pngDimensions(png, `texture "${tex.id}": file "${tex.pngPath}"`);
    return { bytes: png, source: "png", width, height };
  }
  return fail(`texture "${tex.id}": has neither a pixel map nor a PNG source`);
}

/**
 * Expand a pixel-map texture into raw RGBA pixels. Palette colors are
 * "#RRGGBB" (alpha 255), "#RRGGBBAA", or "transparent" (0,0,0,0).
 * Map rows are read by code point, matching the validation in
 * resourcepack.ts.
 */
export function pixelMapToRgba(tex: TextureDef): {
  width: number;
  height: number;
  rgba: Uint8Array;
} {
  const pixelMap = tex.pixelMap;
  if (pixelMap === undefined) {
    fail(`texture "${tex.id}": has no pixel map`);
  }
  const [width, height] = pixelMap.size;
  if (pixelMap.map.length !== height) {
    fail(
      `texture "${tex.id}": pixel map has ${pixelMap.map.length} row(s) but size height is ${height}`,
    );
  }
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const row = pixelMap.map[y];
    if (row === undefined) fail(`texture "${tex.id}": missing pixel row ${y}`);
    const cells = Array.from(row);
    if (cells.length !== width) {
      fail(
        `texture "${tex.id}": pixel row ${y + 1} has ${cells.length} character(s) but size width is ${width}`,
      );
    }
    for (let x = 0; x < width; x++) {
      const key = cells[x];
      if (key === undefined) fail(`texture "${tex.id}": missing pixel at row ${y}, column ${x}`);
      const color = pixelMap.palette[key];
      if (color === undefined) {
        fail(
          `texture "${tex.id}": pixel at row ${y + 1}, column ${x + 1} references missing palette key "${key}"`,
        );
      }
      const [r, g, b, a] = parsePaletteColor(color, tex.id, y, x);
      const offset = (y * width + x) * 4;
      rgba[offset] = r;
      rgba[offset + 1] = g;
      rgba[offset + 2] = b;
      rgba[offset + 3] = a;
    }
  }
  return { width, height, rgba };
}

function parsePaletteColor(
  value: string,
  textureId: string,
  row: number,
  column: number,
): [number, number, number, number] {
  if (value === "transparent") return [0, 0, 0, 0];
  const match = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec(value);
  const hex = match?.[1];
  if (hex === undefined) {
    fail(
      `texture "${textureId}": invalid color "${value}" at row ${row + 1}, column ${column + 1}; ` +
        `expected #RRGGBB, #RRGGBBAA, or "transparent"`,
    );
  }
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
    hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) : 255,
  ];
}

/**
 * Encode raw RGBA pixels as a PNG: 8-bit RGBA (color type 6), filter
 * byte 0 per scanline, one deflate stream. No interlace.
 */
export function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  if (!Number.isInteger(width) || width <= 0) {
    fail(`PNG width must be a positive integer, got ${String(width)}`);
  }
  if (!Number.isInteger(height) || height <= 0) {
    fail(`PNG height must be a positive integer, got ${String(height)}`);
  }
  const expectedLength = width * height * 4;
  if (rgba.length !== expectedLength) {
    fail(`RGBA buffer length is ${rgba.length}, expected ${expectedLength} for ${width}x${height}`);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type 6: truecolor with alpha
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const stride = width * 4;
  const raw = Buffer.alloc(height * (1 + stride));
  const rgbaBuffer = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + stride);
    raw[rowStart] = 0;
    rgbaBuffer.copy(raw, rowStart + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([length, typeBytes, data, crc]);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    const index = (crc ^ byte) & 0xff;
    crc = (crc >>> 8) ^ (CRC_TABLE[index] ?? 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Assemble a deterministic ZIP archive: entries sorted by name,
 * deflate compression (method 8), DOS timestamps pinned to
 * 1980-01-01 00:00:00, no comments or extra fields. Rebuilding the
 * same file set always yields the identical bytes.
 */
export function buildZip(files: ReadonlyMap<string, Buffer>): Buffer {
  const names = [...files.keys()].sort();
  if (names.length > 0xffff) {
    fail(`ZIP entry count is ${names.length}, which exceeds 65535`);
  }
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  interface CentralEntry {
    nameBytes: Buffer;
    compressedLength: number;
    dataLength: number;
    crc: number;
    offset: number;
  }
  const centralEntries: CentralEntry[] = [];

  for (const name of names) {
    const data = files.get(name);
    if (data === undefined) fail(`missing zip entry data for "${name}"`);
    const nameBytes = Buffer.from(name, "utf8");
    const compressed = deflateRawSync(data);
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(8, 8); // method: deflate
    local.writeUInt16LE(0, 10); // DOS time
    local.writeUInt16LE(0x0021, 12); // DOS date: 1980-01-01
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28); // extra length

    localParts.push(local, nameBytes, compressed);
    centralEntries.push({
      nameBytes,
      compressedLength: compressed.length,
      dataLength: data.length,
      crc,
      offset,
    });
    offset += local.length + nameBytes.length + compressed.length;
  }

  const centralStart = offset;
  for (const entry of centralEntries) {
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 8); // flags
    central.writeUInt16LE(8, 10); // method: deflate
    central.writeUInt16LE(0, 12); // DOS time
    central.writeUInt16LE(0x0021, 14); // DOS date: 1980-01-01
    central.writeUInt32LE(entry.crc, 16);
    central.writeUInt32LE(entry.compressedLength, 20);
    central.writeUInt32LE(entry.dataLength, 24);
    central.writeUInt16LE(entry.nameBytes.length, 28);
    central.writeUInt16LE(0, 30); // extra length
    central.writeUInt16LE(0, 32); // comment length
    central.writeUInt16LE(0, 34); // disk number
    central.writeUInt16LE(0, 36); // internal attributes
    central.writeUInt32LE(0, 38); // external attributes
    central.writeUInt32LE(entry.offset, 42);

    centralParts.push(central, entry.nameBytes);
    offset += central.length + entry.nameBytes.length;
  }

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); // disk
  eocd.writeUInt16LE(0, 6); // central directory disk
  eocd.writeUInt16LE(centralEntries.length, 8);
  eocd.writeUInt16LE(centralEntries.length, 10);
  eocd.writeUInt32LE(offset - centralStart, 12);
  eocd.writeUInt32LE(centralStart, 16);
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localParts, ...centralParts, eocd]);
}
