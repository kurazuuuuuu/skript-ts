/**
 * pngdecode.ts
 *
 * Minimal PNG decoder for the `quantize` CLI (RP-5). Supported:
 * non-interlaced images, bit depth 8, color types 2 (RGB),
 * 6 (RGBA) and 3 (palette, PLTE + optional tRNS). Decompression
 * uses node:zlib. Anything else (16-bit, interlaced, grayscale
 * color types 0 / 4, other bit depths) fails with an error that
 * says "unsupported" — the decoder never silently mis-decodes.
 *
 * Drafted with Ollama (deepseek-v4.1-flash) and reviewed/fixed
 * by the implementing lane.
 */
import { inflateSync } from "node:zlib";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export interface DecodedPng {
  width: number;
  height: number;
  /** Raw RGBA pixels, row-major, 4 bytes per pixel. */
  rgba: Uint8Array;
}

function fail(message: string): never {
  throw new Error(`pngdecode: ${message}`);
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

export function decodePng(png: Buffer): DecodedPng {
  if (!Buffer.isBuffer(png)) fail("expected a Buffer");
  if (png.length < PNG_SIGNATURE.length) {
    fail("truncated PNG: file is too short to contain the PNG signature");
  }
  if (!png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    fail("invalid PNG: missing PNG signature");
  }

  let offset = PNG_SIGNATURE.length;
  let width = 0;
  let height = 0;
  let colorType = -1;
  let sawIhdr = false;
  let sawIend = false;
  const idatChunks: Buffer[] = [];
  let palette: Buffer | null = null;
  let trns: Buffer | null = null;

  while (offset < png.length) {
    if (offset + 8 > png.length) fail("truncated PNG: incomplete chunk header");
    const length = png.readUInt32BE(offset);
    const type = png.toString("latin1", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > png.length) {
      fail(`truncated PNG: chunk "${type}" extends past the end of the file`);
    }
    const data = png.subarray(dataStart, dataEnd);

    if (type === "IHDR") {
      if (sawIhdr) fail("invalid PNG: multiple IHDR chunks");
      if (length !== 13) fail("invalid PNG: IHDR chunk must be 13 bytes");
      sawIhdr = true;
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data[8] as number;
      colorType = data[9] as number;
      const compression = data[10] as number;
      const filterMethod = data[11] as number;
      const interlace = data[12] as number;
      if (width === 0 || height === 0) fail("invalid PNG: width and height must be non-zero");
      if (compression !== 0) fail(`unsupported PNG: compression method ${compression}`);
      if (filterMethod !== 0) fail(`unsupported PNG: filter method ${filterMethod}`);
      if (interlace !== 0) fail("unsupported PNG: interlaced images are not supported");
      if (bitDepth !== 8) fail(`unsupported PNG: bit depth ${bitDepth} (only 8 is supported)`);
      if (colorType === 0) fail("unsupported PNG: grayscale (color type 0) is not supported");
      if (colorType === 4) {
        fail("unsupported PNG: grayscale with alpha (color type 4) is not supported");
      }
      if (colorType !== 2 && colorType !== 3 && colorType !== 6) {
        fail(`unsupported PNG: color type ${colorType} is not supported`);
      }
    } else if (type === "PLTE") {
      palette = Buffer.from(data);
    } else if (type === "tRNS") {
      trns = Buffer.from(data);
    } else if (type === "IDAT") {
      idatChunks.push(Buffer.from(data));
    } else if (type === "IEND") {
      sawIend = true;
      break;
    }
    offset = dataEnd + 4;
  }

  if (!sawIhdr) fail("invalid PNG: missing IHDR chunk");
  if (!sawIend) fail("truncated PNG: missing IEND chunk");
  if (idatChunks.length === 0) fail("invalid PNG: missing IDAT chunk");
  if (colorType === 3 && palette === null) {
    fail("invalid PNG: palette image is missing its PLTE chunk");
  }

  const channels = colorType === 2 ? 3 : colorType === 6 ? 4 : 1;
  const bytesPerLine = width * channels;
  const expectedSize = height * (bytesPerLine + 1);
  let inflated: Buffer;
  try {
    inflated = inflateSync(Buffer.concat(idatChunks));
  } catch (err) {
    fail(
      `invalid PNG: failed to inflate IDAT data: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (inflated.length < expectedSize) {
    fail(
      `truncated PNG: inflated data is ${inflated.length} byte(s), expected at least ${expectedSize}`,
    );
  }

  // Undo the per-scanline filters (PNG filter types 0..4).
  const raw = new Uint8Array(height * bytesPerLine);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filterType = inflated[pos++] as number;
    const lineStart = y * bytesPerLine;
    const prevStart = (y - 1) * bytesPerLine;
    for (let x = 0; x < bytesPerLine; x++) {
      const rawByte = inflated[pos++] as number;
      const left = x >= channels ? (raw[lineStart + x - channels] as number) : 0;
      const up = y > 0 ? (raw[prevStart + x] as number) : 0;
      const upLeft = y > 0 && x >= channels ? (raw[prevStart + x - channels] as number) : 0;
      let value: number;
      switch (filterType) {
        case 0:
          value = rawByte;
          break;
        case 1:
          value = rawByte + left;
          break;
        case 2:
          value = rawByte + up;
          break;
        case 3:
          value = rawByte + ((left + up) >> 1);
          break;
        case 4:
          value = rawByte + paeth(left, up, upLeft);
          break;
        default:
          fail(`unsupported PNG: scanline filter type ${filterType}`);
      }
      raw[lineStart + x] = value & 0xff;
    }
  }

  const rgba = new Uint8Array(width * height * 4);
  if (colorType === 6) {
    rgba.set(raw);
  } else if (colorType === 2) {
    for (let i = 0, p = 0; i < width * height; i++, p += 3) {
      const q = i * 4;
      rgba[q] = raw[p] as number;
      rgba[q + 1] = raw[p + 1] as number;
      rgba[q + 2] = raw[p + 2] as number;
      rgba[q + 3] = 255;
    }
  } else {
    const pal = palette as Buffer;
    if (pal.length === 0 || pal.length % 3 !== 0) {
      fail("invalid PNG: PLTE chunk length must be a positive multiple of 3");
    }
    const entries = pal.length / 3;
    for (let i = 0; i < width * height; i++) {
      const idx = raw[i] as number;
      if (idx >= entries) {
        fail(`invalid PNG: palette index ${idx} is out of range (palette has ${entries} entries)`);
      }
      const q = i * 4;
      rgba[q] = pal[idx * 3] as number;
      rgba[q + 1] = pal[idx * 3 + 1] as number;
      rgba[q + 2] = pal[idx * 3 + 2] as number;
      rgba[q + 3] = trns !== null && idx < trns.length ? (trns[idx] as number) : 255;
    }
  }
  return { width, height, rgba };
}
