import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { defineFontChar, defineItem, definePack, defineTexture } from "../src/resourcepack.js";
import {
  buildZip,
  encodePng,
  generatePack,
  pngDimensions,
  type PackManifest,
} from "../src/packgen.js";
import { checkPack } from "../src/packcheck.js";
import { decodePng } from "../src/pngdecode.js";
import { formatQuantizedTexture, quantizePng, quantizeRgba } from "../src/quantize.js";

/* helpers ---------------------------------------------------------- */

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([length, typeBytes, data, crc]);
}

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Minimal PNG header (signature + IHDR + IEND) with chosen IHDR fields. */
function headerPng(opts: {
  width: number;
  height: number;
  bitDepth?: number;
  colorType?: number;
  interlace?: number;
}): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(opts.width >>> 0, 0);
  ihdr.writeUInt32BE(opts.height >>> 0, 4);
  ihdr[8] = opts.bitDepth ?? 8;
  ihdr[9] = opts.colorType ?? 6;
  ihdr[12] = opts.interlace ?? 0;
  return Buffer.concat([PNG_SIG, pngChunk("IHDR", ihdr), pngChunk("IEND", Buffer.alloc(0))]);
}

/** Fully craft a PNG with given color type and pre-filtered scanlines. */
function craftPng(opts: {
  width: number;
  height: number;
  colorType: number;
  bitDepth?: number;
  interlace?: number;
  plte?: Buffer;
  trns?: Buffer;
  rawScanlines: Buffer;
}): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(opts.width, 0);
  ihdr.writeUInt32BE(opts.height, 4);
  ihdr[8] = opts.bitDepth ?? 8;
  ihdr[9] = opts.colorType;
  ihdr[12] = opts.interlace ?? 0;
  const parts = [PNG_SIG, pngChunk("IHDR", ihdr)];
  if (opts.plte !== undefined) parts.push(pngChunk("PLTE", opts.plte));
  if (opts.trns !== undefined) parts.push(pngChunk("tRNS", opts.trns));
  parts.push(pngChunk("IDAT", deflateSync(opts.rawScanlines)), pngChunk("IEND", Buffer.alloc(0)));
  return Buffer.concat(parts);
}

function gemTexture() {
  return defineTexture({
    id: "item/gem",
    size: [2, 2],
    palette: { ".": "transparent", a: "#FF0000", b: "#00FF0080" },
    map: ["a.", "ba"],
  });
}

function sampleGenerated(coinPng: Buffer) {
  const gem = gemTexture();
  const coin = defineTexture({ id: "ui/coin", source: { kind: "png", path: "./coin.png" } });
  const pack = definePack({
    namespace: "example",
    description: "Example resource pack",
    textures: [gem, coin],
    items: [defineItem({ id: "gem", baseItem: "minecraft:amethyst_shard", texture: gem })],
    fontChars: [
      defineFontChar({ id: "ui/coin_icon", texture: coin, char: "\uE000", height: 8, ascent: 7 }),
    ],
  });
  return generatePack(pack, () => coinPng);
}

function rebuildManifest(
  files: ReadonlyMap<string, Buffer>,
  original: PackManifest,
): { zip: Buffer; manifest: PackManifest } {
  const zip = buildZip(files);
  return {
    zip,
    manifest: { ...original, sha1: createHash("sha1").update(zip).digest("hex"), size: zip.length },
  };
}

/* packgen: IHDR validation + manifest textures (RP-5.1) ------------ */

describe("packgen PNG IHDR validation (RP-5)", () => {
  it("accepts a normal small PNG and records its dimensions in the manifest", () => {
    const coinPng = encodePng(3, 2, new Uint8Array(3 * 2 * 4).fill(200));
    const { manifest } = sampleGenerated(coinPng);
    expect(manifest.textures).toEqual([
      { id: "example:item/gem", source: "pixelmap", width: 2, height: 2 },
      { id: "example:ui/coin", source: "png", width: 3, height: 2 },
    ]);
  });

  it("rejects a truncated PNG (cut inside IHDR)", () => {
    const coinPng = encodePng(1, 1, new Uint8Array([1, 2, 3, 255]));
    const truncated = coinPng.subarray(0, 20);
    expect(() => sampleGenerated(Buffer.from(truncated))).toThrow(/truncated PNG/);
  });

  it("rejects a bad PNG signature", () => {
    expect(() => sampleGenerated(Buffer.from("definitely not a png file......"))).toThrow(
      /not a PNG/,
    );
  });

  it("rejects IHDR dimensions of 0 and above 4096", () => {
    expect(() => sampleGenerated(headerPng({ width: 0, height: 16 }))).toThrow(
      /width 0 is outside/,
    );
    expect(() => sampleGenerated(headerPng({ width: 16, height: 0 }))).toThrow(
      /height 0 is outside/,
    );
    expect(() => sampleGenerated(headerPng({ width: 4097, height: 16 }))).toThrow(
      /width 4097 is outside/,
    );
    expect(() => sampleGenerated(headerPng({ width: 16, height: 5000 }))).toThrow(
      /height 5000 is outside/,
    );
  });

  it("pngDimensions parses a valid header", () => {
    expect(pngDimensions(encodePng(5, 7, new Uint8Array(5 * 7 * 4)))).toEqual({
      width: 5,
      height: 7,
    });
  });
});

/* packcheck (RP-5.2) ----------------------------------------------- */

describe("checkPack (RP-5)", () => {
  const coinPng = encodePng(1, 1, new Uint8Array([0xf2, 0xc2, 0x30, 255]));

  it("returns no problems for a freshly generated pack", () => {
    const { zip, manifest } = sampleGenerated(coinPng);
    expect(checkPack(zip, manifest)).toEqual([]);
  });

  it("detects a missing file", () => {
    const gen = sampleGenerated(coinPng);
    const files = new Map(gen.files);
    files.delete("assets/example/textures/ui/coin.png");
    const { zip, manifest } = rebuildManifest(files, gen.manifest);
    const problems = checkPack(zip, manifest);
    expect(problems.some((p) => p.includes("missing file") && p.includes("coin.png"))).toBe(true);
  });

  it("detects an undeclared extra file", () => {
    const gen = sampleGenerated(coinPng);
    const files = new Map(gen.files);
    files.set("assets/example/textures/stray.png", coinPng);
    const { zip, manifest } = rebuildManifest(files, gen.manifest);
    const problems = checkPack(zip, manifest);
    expect(problems.some((p) => p.includes("undeclared file") && p.includes("stray.png"))).toBe(
      true,
    );
  });

  it("detects a sha1 mismatch", () => {
    const gen = sampleGenerated(coinPng);
    const problems = checkPack(gen.zip, { ...gen.manifest, sha1: "0".repeat(40) });
    expect(problems.some((p) => p.includes("sha1 mismatch"))).toBe(true);
  });

  it("detects a model referencing a missing texture", () => {
    const gen = sampleGenerated(coinPng);
    const files = new Map(gen.files);
    const modelPath = "assets/example/models/item/gem.json";
    files.set(
      modelPath,
      Buffer.from(
        JSON.stringify({
          parent: "minecraft:item/generated",
          textures: { layer0: "example:item/ghost" },
        }) + "\n",
        "utf8",
      ),
    );
    const { zip, manifest } = rebuildManifest(files, gen.manifest);
    const problems = checkPack(zip, manifest);
    expect(
      problems.some((p) => p.includes("references missing texture") && p.includes("ghost")),
    ).toBe(true);
  });

  it("detects duplicate font characters", () => {
    const gen = sampleGenerated(coinPng);
    const files = new Map(gen.files);
    const fontPath = "assets/example/font/default.json";
    files.set(
      fontPath,
      Buffer.from(
        JSON.stringify({
          providers: [
            {
              type: "bitmap",
              file: "example:ui/coin.png",
              height: 8,
              ascent: 7,
              chars: ["\uE000"],
            },
            {
              type: "bitmap",
              file: "example:ui/coin.png",
              height: 8,
              ascent: 7,
              chars: ["\uE000"],
            },
          ],
        }) + "\n",
        "utf8",
      ),
    );
    const { zip, manifest } = rebuildManifest(files, gen.manifest);
    const problems = checkPack(zip, manifest);
    expect(problems.some((p) => p.includes("duplicate font character"))).toBe(true);
  });

  it("detects an IHDR dimension that disagrees with the manifest record", () => {
    const other = encodePng(4, 4, new Uint8Array(4 * 4 * 4).fill(7));
    const gen = sampleGenerated(other);
    const lied: PackManifest = {
      ...gen.manifest,
      textures: gen.manifest.textures.map((t) =>
        t.source === "png" ? { ...t, width: 9, height: 9 } : t,
      ),
    };
    const problems = checkPack(gen.zip, lied);
    expect(problems.some((p) => p.includes("do not match the manifest record"))).toBe(true);
  });
});

/* pngdecode (RP-5.3) ----------------------------------------------- */

describe("decodePng (RP-5)", () => {
  it("round-trips an encodePng RGBA image exactly", () => {
    const rgba = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 255]);
    const decoded = decodePng(encodePng(2, 2, rgba));
    expect(decoded.width).toBe(2);
    expect(decoded.height).toBe(2);
    expect([...decoded.rgba]).toEqual([...rgba]);
  });

  it("decodes RGB (color type 2) with opaque alpha", () => {
    // One scanline, filter 0, two RGB pixels.
    const raw = Buffer.from([0, 255, 0, 0, 0, 255, 0]);
    const decoded = decodePng(craftPng({ width: 2, height: 1, colorType: 2, rawScanlines: raw }));
    expect([...decoded.rgba]).toEqual([255, 0, 0, 255, 0, 255, 0, 255]);
  });

  it("decodes palette (color type 3) with tRNS alpha", () => {
    const raw = Buffer.from([0, 0, 1]);
    const decoded = decodePng(
      craftPng({
        width: 2,
        height: 1,
        colorType: 3,
        plte: Buffer.from([10, 20, 30, 200, 210, 220]),
        trns: Buffer.from([255, 64]),
        rawScanlines: raw,
      }),
    );
    expect([...decoded.rgba]).toEqual([10, 20, 30, 255, 200, 210, 220, 64]);
  });

  it("undoes Sub and Up filters", () => {
    // 2x2 RGBA. Row 0 filter 1 (Sub): first pixel raw, second is delta.
    // Row 1 filter 2 (Up): each byte is delta from the row above.
    const row0 = Buffer.from([1, 10, 20, 30, 255, 5, 5, 5, 0]);
    const row1 = Buffer.from([2, 1, 1, 1, 0, 1, 1, 1, 0]);
    const decoded = decodePng(
      craftPng({ width: 2, height: 2, colorType: 6, rawScanlines: Buffer.concat([row0, row1]) }),
    );
    expect([...decoded.rgba]).toEqual([
      10, 20, 30, 255, 15, 25, 35, 255, 11, 21, 31, 255, 16, 26, 36, 255,
    ]);
  });

  it("rejects unsupported formats with an explicit unsupported error", () => {
    const emptyRow = Buffer.from([0, 0, 0, 0, 255]);
    expect(() =>
      decodePng(
        craftPng({ width: 1, height: 1, colorType: 0, rawScanlines: Buffer.from([0, 128]) }),
      ),
    ).toThrow(/unsupported/);
    expect(() =>
      decodePng(
        craftPng({ width: 1, height: 1, colorType: 6, bitDepth: 16, rawScanlines: emptyRow }),
      ),
    ).toThrow(/unsupported/);
    expect(() =>
      decodePng(
        craftPng({ width: 1, height: 1, colorType: 6, interlace: 1, rawScanlines: emptyRow }),
      ),
    ).toThrow(/unsupported/);
  });
});

/* quantize (RP-5.3) ------------------------------------------------ */

describe("quantize (RP-5)", () => {
  it("quantizes a gradient within the color budget and keeps dimensions", () => {
    const width = 16;
    const height = 16;
    const rgba = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const o = (y * width + x) * 4;
        rgba[o] = x * 17;
        rgba[o + 1] = y * 17;
        rgba[o + 2] = 128;
        rgba[o + 3] = 255;
      }
    }
    const png = encodePng(width, height, rgba);
    const q = quantizePng(png, { maxColors: 4 });
    expect(Object.keys(q.palette).length).toBeLessThanOrEqual(4);
    expect(q.map).toHaveLength(16);
    expect(q.map.every((row) => row.length === 16)).toBe(true);
    for (const row of q.map) {
      for (const ch of row) expect(q.palette[ch]).toBeDefined();
    }
    // Resizing keeps the requested dimensions.
    const resized = quantizePng(png, { maxColors: 4, size: [8, 4] });
    expect(resized.width).toBe(8);
    expect(resized.height).toBe(4);
    expect(resized.map).toHaveLength(4);
    expect(resized.map.every((row) => row.length === 8)).toBe(true);
  });

  it("applies the alpha threshold: <128 transparent, >=128 opaque", () => {
    // pixels: alpha 0, alpha 100, alpha 200 (red), alpha 255 (red)
    const rgba = new Uint8Array([255, 0, 0, 0, 255, 0, 0, 100, 255, 0, 0, 200, 255, 0, 0, 255]);
    const q = quantizeRgba(rgba, 4, 1, 16);
    expect(q.palette["."]).toBe("transparent");
    expect(q.map[0]?.[0]).toBe(".");
    expect(q.map[0]?.[1]).toBe(".");
    expect(q.map[0]?.[2]).not.toBe(".");
    expect(q.map[0]?.[3]).not.toBe(".");
    // The opaque reds share one palette color with no alpha in it.
    const opaqueKey = q.map[0]?.[2] as string;
    expect(q.palette[opaqueKey]).toMatch(/^#[0-9A-F]{6}$/);
  });

  it("formats TypeScript source that names the palette and map", () => {
    const q = quantizeRgba(new Uint8Array([255, 0, 0, 255]), 1, 1, 16);
    const source = formatQuantizedTexture(q, "item/dot");
    expect(source).toContain("defineTexture");
    expect(source).toContain('"item/dot"');
    expect(source).toContain("size: [1, 1]");
  });
});
