/**
 * quantize.ts
 *
 * Median-cut color quantization for the `quantize` CLI (RP-5):
 * turns a decoded PNG into a `defineTexture` pixel map
 * (palette + character map).
 *
 * Transparency rule (also in docs/reference.md): a pixel whose
 * alpha is below 128 is transparent and maps to "."; a pixel
 * whose alpha is 128 or above is opaque — its alpha is discarded
 * and its RGB is quantized as a fully opaque color. The palette
 * therefore only ever holds "#RRGGBB" colors plus the "."
 * transparent entry, and `--colors N` bounds the total palette
 * size including the transparent entry when one is present.
 */
import { decodePng } from "./pngdecode.js";

/** Characters available for palette keys, in assignment order. */
export const PALETTE_CHARS =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%&*+,-/:;<=>?@[]^_{|}~";

export const TRANSPARENT_ALPHA_THRESHOLD = 128;

export interface QuantizedTexture {
  width: number;
  height: number;
  /** Palette key -> "#RRGGBB" or "transparent" (key "." only). */
  palette: Record<string, string>;
  /** One string per row; each character is a palette key. */
  map: string[];
}

interface ColorCount {
  r: number;
  g: number;
  b: number;
  count: number;
}

function hexColor(r: number, g: number, b: number): string {
  const part = (v: number): string => v.toString(16).padStart(2, "0").toUpperCase();
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** Resize raw RGBA pixels with nearest-neighbor sampling. */
export function resizeNearestRgba(
  rgba: Uint8Array,
  width: number,
  height: number,
  targetWidth: number,
  targetHeight: number,
): Uint8Array {
  const out = new Uint8Array(targetWidth * targetHeight * 4);
  for (let y = 0; y < targetHeight; y++) {
    const sy = Math.floor((y * height) / targetHeight);
    for (let x = 0; x < targetWidth; x++) {
      const sx = Math.floor((x * width) / targetWidth);
      const src = (sy * width + sx) * 4;
      const dst = (y * targetWidth + x) * 4;
      out[dst] = rgba[src] as number;
      out[dst + 1] = rgba[src + 1] as number;
      out[dst + 2] = rgba[src + 2] as number;
      out[dst + 3] = rgba[src + 3] as number;
    }
  }
  return out;
}

function boxRange(box: ColorCount[]): { channel: number; range: number } {
  let minR = 255;
  let maxR = 0;
  let minG = 255;
  let maxG = 0;
  let minB = 255;
  let maxB = 0;
  for (const c of box) {
    if (c.r < minR) minR = c.r;
    if (c.r > maxR) maxR = c.r;
    if (c.g < minG) minG = c.g;
    if (c.g > maxG) maxG = c.g;
    if (c.b < minB) minB = c.b;
    if (c.b > maxB) maxB = c.b;
  }
  const ranges = [maxR - minR, maxG - minG, maxB - minB];
  let channel = 0;
  for (let i = 1; i < 3; i++) if ((ranges[i] as number) > (ranges[channel] as number)) channel = i;
  return { channel, range: ranges[channel] as number };
}

/** Median-cut: split color boxes until `budget` palette colors exist. */
function medianCut(colors: ColorCount[], budget: number): [number, number, number][] {
  const boxes: ColorCount[][] = [colors];
  while (boxes.length < budget) {
    // Pick the splittable box with the largest channel range
    // (ties: the most pixels, then the most distinct colors).
    let pick = -1;
    let pickRange = -1;
    let pickCount = -1;
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i] as ColorCount[];
      if (box.length < 2) continue;
      const { range } = boxRange(box);
      if (range === 0) continue;
      const count = box.reduce((sum, c) => sum + c.count, 0);
      if (range > pickRange || (range === pickRange && count > pickCount)) {
        pick = i;
        pickRange = range;
        pickCount = count;
      }
    }
    if (pick === -1) break;
    const box = boxes[pick] as ColorCount[];
    const { channel } = boxRange(box);
    const keyOf = (c: ColorCount): number => (channel === 0 ? c.r : channel === 1 ? c.g : c.b);
    const sorted = [...box].sort((a, b) => keyOf(a) - keyOf(b));
    const total = sorted.reduce((sum, c) => sum + c.count, 0);
    let acc = 0;
    let split = sorted.length - 1;
    for (let i = 0; i < sorted.length; i++) {
      acc += (sorted[i] as ColorCount).count;
      if (acc >= total / 2) {
        split = Math.min(i + 1, sorted.length - 1);
        break;
      }
    }
    boxes.splice(pick, 1, sorted.slice(0, split), sorted.slice(split));
  }
  return boxes.map((box) => {
    let r = 0;
    let g = 0;
    let b = 0;
    let total = 0;
    for (const c of box) {
      r += c.r * c.count;
      g += c.g * c.count;
      b += c.b * c.count;
      total += c.count;
    }
    return [Math.round(r / total), Math.round(g / total), Math.round(b / total)];
  });
}

export function quantizeRgba(
  rgba: Uint8Array,
  width: number,
  height: number,
  maxColors: number,
): QuantizedTexture {
  if (!Number.isInteger(maxColors) || maxColors < 1) {
    throw new Error(`quantize: --colors must be a positive integer, got ${maxColors}`);
  }
  if (maxColors > PALETTE_CHARS.length + 1) {
    throw new Error(
      `quantize: --colors ${maxColors} exceeds the ${PALETTE_CHARS.length + 1} single-character palette keys available`,
    );
  }
  const pixelCount = width * height;
  const isTransparent = Array.from({ length: pixelCount }, () => false);
  let hasTransparent = false;
  const colorCounts = new Map<number, ColorCount>();
  for (let i = 0; i < pixelCount; i++) {
    const offset = i * 4;
    const alpha = rgba[offset + 3] as number;
    if (alpha < TRANSPARENT_ALPHA_THRESHOLD) {
      isTransparent[i] = true;
      hasTransparent = true;
      continue;
    }
    const r = rgba[offset] as number;
    const g = rgba[offset + 1] as number;
    const b = rgba[offset + 2] as number;
    const key = (r << 16) | (g << 8) | b;
    const entry = colorCounts.get(key);
    if (entry !== undefined) entry.count++;
    else colorCounts.set(key, { r, g, b, count: 1 });
  }

  const opaqueBudget = hasTransparent ? maxColors - 1 : maxColors;
  if (colorCounts.size > 0 && opaqueBudget < 1) {
    throw new Error(
      `quantize: --colors ${maxColors} leaves no palette slot for opaque colors (one slot is used by transparency)`,
    );
  }

  const paletteColors =
    colorCounts.size === 0
      ? []
      : medianCut([...colorCounts.values()], Math.min(opaqueBudget, colorCounts.size));

  const palette: Record<string, string> = {};
  if (hasTransparent) palette["."] = "transparent";
  paletteColors.forEach(([r, g, b], index) => {
    palette[PALETTE_CHARS[index] as string] = hexColor(r, g, b);
  });

  // Nearest palette color per distinct source color (cached).
  const nearestCache = new Map<number, string>();
  const keyForColor = (r: number, g: number, b: number): string => {
    const key = (r << 16) | (g << 8) | b;
    const cached = nearestCache.get(key);
    if (cached !== undefined) return cached;
    let best = "";
    let bestDist = Number.POSITIVE_INFINITY;
    paletteColors.forEach(([pr, pg, pb], index) => {
      const dist = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        best = PALETTE_CHARS[index] as string;
      }
    });
    nearestCache.set(key, best);
    return best;
  };

  const map: string[] = [];
  for (let y = 0; y < height; y++) {
    let row = "";
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (isTransparent[i]) {
        row += ".";
        continue;
      }
      const offset = i * 4;
      row += keyForColor(
        rgba[offset] as number,
        rgba[offset + 1] as number,
        rgba[offset + 2] as number,
      );
    }
    map.push(row);
  }
  return { width, height, palette, map };
}

/** Decode a PNG, optionally resize it, and quantize it. */
export function quantizePng(
  png: Buffer,
  opts: { maxColors?: number; size?: readonly [number, number] } = {},
): QuantizedTexture {
  const decoded = decodePng(png);
  let { width, height, rgba } = decoded;
  if (opts.size !== undefined) {
    const [tw, th] = opts.size;
    if (tw !== width || th !== height) {
      rgba = resizeNearestRgba(rgba, width, height, tw, th);
      width = tw;
      height = th;
    }
  }
  return quantizeRgba(rgba, width, height, opts.maxColors ?? 16);
}

/** Format a quantized texture as `defineTexture` TypeScript source. */
export function formatQuantizedTexture(quantized: QuantizedTexture, id: string): string {
  const paletteLines = Object.entries(quantized.palette)
    .map(([key, value]) => `    ${JSON.stringify(key)}: ${JSON.stringify(value)},`)
    .join("\n");
  const mapLines = quantized.map.map((row) => `    ${JSON.stringify(row)},`).join("\n");
  return [
    `// Generated by \`skript-ts quantize\` (RP-5). Transparency rule:`,
    `// alpha < ${TRANSPARENT_ALPHA_THRESHOLD} is transparent ("."), alpha >= ${TRANSPARENT_ALPHA_THRESHOLD} is opaque.`,
    `import { defineTexture } from "skript-ts";`,
    ``,
    `export const quantizedTexture = defineTexture({`,
    `  id: ${JSON.stringify(id)},`,
    `  size: [${quantized.width}, ${quantized.height}],`,
    `  palette: {`,
    paletteLines,
    `  },`,
    `  map: [`,
    mapLines,
    `  ],`,
    `});`,
    ``,
  ].join("\n");
}
