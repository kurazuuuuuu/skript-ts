import { createHash } from "node:crypto";
import { inflateRawSync, inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  defineFontChar,
  defineItem,
  definePack,
  defineTexture,
  parseResourceId,
  type PackDef,
} from "../src/resourcepack.js";
import { buildZip, encodePng, generatePack, pixelMapToRgba } from "../src/packgen.js";

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

/** Bitwise CRC-32 (PNG/ZIP flavor), independent of the implementation. */
function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) {
      crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

interface PngChunk {
  type: string;
  data: Buffer;
  crcOk: boolean;
}

function parsePng(png: Buffer): PngChunk[] {
  expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const chunks: PngChunk[] = [];
  let offset = 8;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    const crc = png.readUInt32BE(offset + 8 + length);
    const expectCrc = crc32(Buffer.concat([Buffer.from(type, "ascii"), data]));
    chunks.push({ type, data, crcOk: crc === expectCrc });
    offset += 12 + length;
  }
  return chunks;
}

/** Decode an encodePng() output back into raw RGBA pixels. */
function decodePngPixels(png: Buffer): { width: number; height: number; rgba: Buffer } {
  const chunks = parsePng(png);
  const ihdr = chunks.find((c) => c.type === "IHDR");
  const idat = chunks.find((c) => c.type === "IDAT");
  if (!ihdr || !idat) throw new Error("missing IHDR/IDAT");
  const width = ihdr.data.readUInt32BE(0);
  const height = ihdr.data.readUInt32BE(4);
  const raw = inflateSync(idat.data);
  const stride = width * 4;
  expect(raw.length).toBe(height * (1 + stride));
  const rgba = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    expect(raw[y * (1 + stride)]).toBe(0); // filter: none
    raw.copy(rgba, y * stride, y * (1 + stride) + 1, (y + 1) * (1 + stride));
  }
  return { width, height, rgba };
}

/** Read a zip back through its local headers and inflate every entry. */
function unzipLocal(zip: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  let offset = 0;
  while (offset + 4 <= zip.length && zip.readUInt32LE(offset) === 0x04034b50) {
    const method = zip.readUInt16LE(offset + 8);
    const crc = zip.readUInt32LE(offset + 14);
    const compressedSize = zip.readUInt32LE(offset + 18);
    const nameLength = zip.readUInt16LE(offset + 26);
    const extraLength = zip.readUInt16LE(offset + 28);
    const name = zip.toString("utf8", offset + 30, offset + 30 + nameLength);
    const dataStart = offset + 30 + nameLength + extraLength;
    const compressed = zip.subarray(dataStart, dataStart + compressedSize);
    const data = method === 8 ? inflateRawSync(compressed) : Buffer.from(compressed);
    expect(crc32(data)).toBe(crc);
    out.set(name, data);
    offset = dataStart + compressedSize;
  }
  return out;
}

function gemTexture() {
  return defineTexture({
    id: "item/gem",
    size: [2, 2],
    palette: { ".": "transparent", a: "#FF0000", b: "#00FF0080" },
    map: ["a.", "ba"],
  });
}

function samplePack(): { pack: PackDef; coinPng: Buffer } {
  const gem = gemTexture();
  const coinPng = encodePng(1, 1, new Uint8Array([0xf2, 0xc2, 0x30, 255]));
  const coin = defineTexture({ id: "ui/coin", source: { kind: "png", path: "./coin.png" } });
  const pack = definePack({
    namespace: "example",
    description: "Example resource pack",
    textures: [gem, coin],
    items: [
      defineItem({
        id: "gem",
        baseItem: "minecraft:amethyst_shard",
        displayName: "ジェム",
        texture: gem,
      }),
    ],
    fontChars: [
      defineFontChar({ id: "ui/coin_icon", texture: coin, char: "\uE000", height: 8, ascent: 7 }),
    ],
  });
  return { pack, coinPng };
}

function sampleGenerated() {
  const { pack, coinPng } = samplePack();
  return generatePack(pack, (path) => {
    if (path !== "./coin.png") throw new Error(`unexpected read: ${path}`);
    return coinPng;
  });
}

/* ------------------------------------------------------------------ */
/* definition API                                                      */
/* ------------------------------------------------------------------ */

describe("parseResourceId", () => {
  it("applies the default namespace to bare paths", () => {
    expect(parseResourceId("item/gem", "example")).toEqual({
      namespace: "example",
      path: "item/gem",
    });
  });

  it("keeps an explicit namespace", () => {
    expect(parseResourceId("other:item/gem", "example")).toEqual({
      namespace: "other",
      path: "item/gem",
    });
  });
});

describe("defineTexture validation", () => {
  it("rejects a row whose length differs from the size width, naming the line", () => {
    expect(() =>
      defineTexture({
        id: "item/bad",
        size: [2, 2],
        palette: { a: "#FF0000" },
        map: ["aa", "a"],
      }),
    ).toThrow(/line 2/);
  });

  it("rejects a row count that differs from the size height", () => {
    expect(() =>
      defineTexture({
        id: "item/bad",
        size: [2, 3],
        palette: { a: "#FF0000" },
        map: ["aa", "aa"],
      }),
    ).toThrow(/row\(s\) but size height is 3/);
  });

  it("rejects a character missing from the palette, naming line and column", () => {
    expect(() =>
      defineTexture({
        id: "item/bad",
        size: [2, 1],
        palette: { a: "#FF0000" },
        map: ["az"],
      }),
    ).toThrow(/line 1.*column 2/);
  });

  it("rejects an invalid palette color", () => {
    expect(() =>
      defineTexture({ id: "item/bad", size: [1, 1], palette: { a: "red" }, map: ["a"] }),
    ).toThrow(/color must be/);
  });

  it("rejects a palette key longer than one character", () => {
    expect(() =>
      defineTexture({ id: "item/bad", size: [1, 1], palette: { ab: "#FF0000" }, map: ["a"] }),
    ).toThrow(/palette key/);
  });

  it("rejects uppercase resource ids", () => {
    expect(() =>
      defineTexture({ id: "Item/Gem", size: [1, 1], palette: { a: "#FF0000" }, map: ["a"] }),
    ).toThrow(/uppercase/);
  });

  it("rejects a PNG source whose path does not end in .png", () => {
    expect(() =>
      defineTexture({ id: "ui/coin", source: { kind: "png", path: "./coin.jpg" } }),
    ).toThrow(/must end with ".png"/);
  });

  it("defaults the size to 16x16", () => {
    const tex = defineTexture({
      id: "item/full",
      palette: { a: "#112233" },
      map: Array.from({ length: 16 }, () => "a".repeat(16)),
    });
    expect(tex.pixelMap?.size).toEqual([16, 16]);
  });
});

describe("defineItem / defineFontChar validation", () => {
  it("rejects an item with neither texture nor model", () => {
    expect(() => defineItem({ id: "gem", baseItem: "minecraft:diamond" })).toThrow(
      /either "texture" or "model"/,
    );
  });

  it("rejects a font char longer than one code point", () => {
    const tex = gemTexture();
    expect(() => defineFontChar({ id: "ui/x", texture: tex, char: "ab", ascent: 7 })).toThrow(
      /exactly one code point/,
    );
  });

  it("rejects an ascent above the height", () => {
    const tex = gemTexture();
    expect(() =>
      defineFontChar({ id: "ui/x", texture: tex, char: "\uE000", height: 8, ascent: 9 }),
    ).toThrow(/ascent/);
  });
});

describe("definePack cross-validation", () => {
  it("rejects duplicate texture ids after namespace resolution", () => {
    const a = gemTexture();
    const b = defineTexture({
      id: "example:item/gem",
      size: [1, 1],
      palette: { a: "#000000" },
      map: ["a"],
    });
    expect(() => definePack({ namespace: "example", description: "x", textures: [a, b] })).toThrow(
      /duplicate texture id/,
    );
  });

  it("rejects duplicate item ids", () => {
    const tex = gemTexture();
    const one = defineItem({ id: "gem", baseItem: "minecraft:diamond", texture: tex });
    const two = defineItem({ id: "gem", baseItem: "minecraft:emerald", texture: tex });
    expect(() =>
      definePack({ namespace: "example", description: "x", textures: [tex], items: [one, two] }),
    ).toThrow(/duplicate item id/);
  });

  it("rejects duplicate font chars", () => {
    const tex = gemTexture();
    const a = defineFontChar({ id: "ui/a", texture: tex, char: "\uE000", ascent: 7 });
    const b = defineFontChar({ id: "ui/b", texture: tex, char: "\uE000", ascent: 7 });
    expect(() =>
      definePack({ namespace: "example", description: "x", textures: [tex], fontChars: [a, b] }),
    ).toThrow(/duplicate font character char/);
  });

  it("rejects a string texture reference that is not declared", () => {
    const item = defineItem({ id: "gem", baseItem: "minecraft:diamond", texture: "item/ghost" });
    expect(() => definePack({ namespace: "example", description: "x", items: [item] })).toThrow(
      /unknown texture id/,
    );
  });
});

/* ------------------------------------------------------------------ */
/* pixel maps and PNG encoding                                         */
/* ------------------------------------------------------------------ */

describe("pixelMapToRgba", () => {
  it("expands palette colors, #RRGGBBAA alpha and transparency exactly", () => {
    const { width, height, rgba } = pixelMapToRgba(gemTexture());
    expect(width).toBe(2);
    expect(height).toBe(2);
    expect([...rgba]).toEqual([
      255,
      0,
      0,
      255, // a: #FF0000
      0,
      0,
      0,
      0, // .: transparent
      0,
      255,
      0,
      128, // b: #00FF0080
      255,
      0,
      0,
      255, // a
    ]);
  });
});

describe("encodePng", () => {
  it("produces a structurally valid PNG whose pixels round-trip", () => {
    const rgba = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    const png = encodePng(2, 2, rgba);
    const chunks = parsePng(png);
    expect(chunks.map((c) => c.type)).toEqual(["IHDR", "IDAT", "IEND"]);
    expect(chunks.every((c) => c.crcOk)).toBe(true);
    const decoded = decodePngPixels(png);
    expect(decoded.width).toBe(2);
    expect(decoded.height).toBe(2);
    expect(decoded.rgba).toEqual(Buffer.from(rgba));
  });

  it("rejects an RGBA buffer of the wrong length", () => {
    expect(() => encodePng(2, 2, new Uint8Array(4))).toThrow(/expected 16/);
  });
});

/* ------------------------------------------------------------------ */
/* pack generation                                                     */
/* ------------------------------------------------------------------ */

describe("generatePack", () => {
  it("emits exactly the expected file set", () => {
    const { files } = sampleGenerated();
    expect([...files.keys()].sort()).toEqual([
      "assets/example/font/default.json",
      "assets/example/items/gem.json",
      "assets/example/models/item/gem.json",
      "assets/example/textures/item/gem.png",
      "assets/example/textures/ui/coin.png",
      "pack.mcmeta",
    ]);
  });

  it("writes the 1.21.11 pack.mcmeta form", () => {
    const { files } = sampleGenerated();
    const mcmeta = JSON.parse(files.get("pack.mcmeta")!.toString("utf8"));
    expect(mcmeta).toEqual({
      pack: { description: "Example resource pack", min_format: [75, 0], max_format: [75, 0] },
    });
  });

  it("writes the data-driven item definition and model JSON", () => {
    const { files } = sampleGenerated();
    const itemDef = JSON.parse(files.get("assets/example/items/gem.json")!.toString("utf8"));
    expect(itemDef).toEqual({
      model: { type: "minecraft:model", model: "example:item/gem" },
    });
    const model = JSON.parse(files.get("assets/example/models/item/gem.json")!.toString("utf8"));
    expect(model).toEqual({
      parent: "minecraft:item/generated",
      textures: { layer0: "example:item/gem" },
    });
  });

  it("writes the bitmap font provider for the pack font", () => {
    const { files } = sampleGenerated();
    const font = JSON.parse(files.get("assets/example/font/default.json")!.toString("utf8"));
    expect(font).toEqual({
      providers: [
        { type: "bitmap", file: "example:ui/coin.png", height: 8, ascent: 7, chars: ["\uE000"] },
      ],
    });
  });

  it("renders the pixel-map texture to a PNG with the exact pixels", () => {
    const { files } = sampleGenerated();
    const png = files.get("assets/example/textures/item/gem.png")!;
    const decoded = decodePngPixels(png);
    expect(decoded.width).toBe(2);
    expect(decoded.rgba).toEqual(
      Buffer.from([255, 0, 0, 255, 0, 0, 0, 0, 0, 255, 0, 128, 255, 0, 0, 255]),
    );
  });

  it("copies PNG-source textures through unchanged", () => {
    const { coinPng } = samplePack();
    const { files } = sampleGenerated();
    expect(files.get("assets/example/textures/ui/coin.png")).toEqual(coinPng);
  });

  it("rejects a PNG source that is not a PNG", () => {
    const { pack } = samplePack();
    expect(() => generatePack(pack, () => Buffer.from("not a png"))).toThrow(/not a PNG/);
  });

  it("manifest hash and size describe the zip, contents are sorted", () => {
    const { zip, sha1, manifest } = sampleGenerated();
    expect(manifest.zipFile).toBe("example.zip");
    expect(manifest.size).toBe(zip.length);
    expect(manifest.sha1).toBe(sha1);
    expect(sha1).toBe(createHash("sha1").update(zip).digest("hex"));
    expect(manifest.contents).toEqual([...manifest.contents].sort());
    expect(manifest.packFormat).toEqual([75, 0]);
  });

  it("is deterministic: rebuilding yields the identical zip", () => {
    const a = sampleGenerated();
    const b = sampleGenerated();
    expect(a.zip.equals(b.zip)).toBe(true);
    expect(a.sha1).toBe(b.sha1);
  });

  it("zip entries inflate back to the generated files", () => {
    const { files, zip } = sampleGenerated();
    const entries = unzipLocal(zip);
    expect([...entries.keys()].sort()).toEqual([...files.keys()].sort());
    for (const [path, data] of files) {
      expect(entries.get(path)).toEqual(data);
    }
  });

  it("generates only the item definition for a model-only item", () => {
    const pack = definePack({
      namespace: "example",
      description: "x",
      items: [
        defineItem({ id: "plain", baseItem: "minecraft:stick", model: "minecraft:item/stick" }),
      ],
    });
    const { files } = generatePack(pack, () => {
      throw new Error("no PNG reads expected");
    });
    expect([...files.keys()].sort()).toEqual(["assets/example/items/plain.json", "pack.mcmeta"]);
  });

  it("rejects an inline texture that conflicts with a declared one", () => {
    const declared = gemTexture();
    const conflicting = defineTexture({
      id: "item/gem",
      size: [1, 1],
      palette: { a: "#000000" },
      map: ["a"],
    });
    const pack = definePack({
      namespace: "example",
      description: "x",
      textures: [declared],
      items: [defineItem({ id: "gem", baseItem: "minecraft:diamond", texture: conflicting })],
    });
    expect(() =>
      generatePack(pack, () => {
        throw new Error("no PNG reads expected");
      }),
    ).toThrow(/already declared/);
  });
});

describe("manifest items (RP-2)", () => {
  it("records each item with its resolved ids and no number by default", () => {
    const { manifest } = sampleGenerated();
    expect(manifest.items).toEqual([
      {
        id: "example:gem",
        baseItem: "minecraft:amethyst_shard",
        model: "example:item/gem",
      },
    ]);
  });

  it("records the allocated registry number when allocations are given", () => {
    const { pack, coinPng } = samplePack();
    const { manifest } = generatePack(pack, () => coinPng, {
      customModelData: new Map([["example:gem", 7]]),
    });
    expect(manifest.items).toEqual([
      {
        id: "example:gem",
        baseItem: "minecraft:amethyst_shard",
        model: "example:item/gem",
        customModelData: 7,
      },
    ]);
  });

  it("validates an explicit customModelData on defineItem", () => {
    const gem = gemTexture();
    expect(() =>
      defineItem({ id: "bad", baseItem: "minecraft:stone", texture: gem, customModelData: 0 }),
    ).toThrow(/customModelData must be a positive integer/);
    expect(() =>
      defineItem({ id: "bad", baseItem: "minecraft:stone", texture: gem, customModelData: 1.5 }),
    ).toThrow(/customModelData must be a positive integer/);
    const ok = defineItem({
      id: "fine",
      baseItem: "minecraft:stone",
      texture: gem,
      customModelData: 3,
    });
    expect(ok.customModelData).toBe(3);
  });
});

describe("buildZip", () => {
  it("builds a valid empty zip", () => {
    const zip = buildZip(new Map());
    expect(zip.length).toBe(22);
    expect(zip.readUInt32LE(0)).toBe(0x06054b50);
    expect(unzipLocal(zip).size).toBe(0);
  });
});
