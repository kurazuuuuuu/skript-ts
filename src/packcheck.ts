/**
 * packcheck.ts
 *
 * Self-verification for a generated resource pack (RP-5).
 * `checkPack` re-reads a pack zip against its manifest and
 * returns a list of problems — an empty list means the pack is
 * sound. It never throws on a bad pack: every defect it can find
 * becomes a problem string. The project build runs it on every
 * generated pack and fails the build when the list is non-empty.
 */
import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { pngDimensions, type PackManifest } from "./packgen.js";

/** Unzip entries through their local headers (the form buildZip writes). */
export function unzipPack(zip: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  let offset = 0;
  while (offset + 4 <= zip.length && zip.readUInt32LE(offset) === 0x04034b50) {
    if (offset + 30 > zip.length) throw new Error("truncated local file header");
    const method = zip.readUInt16LE(offset + 8);
    const compressedSize = zip.readUInt32LE(offset + 18);
    const nameLength = zip.readUInt16LE(offset + 26);
    const extraLength = zip.readUInt16LE(offset + 28);
    const name = zip.toString("utf8", offset + 30, offset + 30 + nameLength);
    const dataStart = offset + 30 + nameLength + extraLength;
    if (dataStart + compressedSize > zip.length) {
      throw new Error(`truncated data for entry "${name}"`);
    }
    const compressed = zip.subarray(dataStart, dataStart + compressedSize);
    let data: Buffer;
    if (method === 8) data = inflateRawSync(compressed);
    else if (method === 0) data = Buffer.from(compressed);
    else throw new Error(`unsupported compression method ${method} for entry "${name}"`);
    out.set(name, data);
    offset = dataStart + compressedSize;
  }
  return out;
}

function textureZipPath(resourceId: string): string | null {
  const colon = resourceId.indexOf(":");
  if (colon === -1) return null;
  const ns = resourceId.slice(0, colon);
  const path = resourceId.slice(colon + 1);
  return `assets/${ns}/textures/${path}.png`;
}

function parseJsonEntry(
  files: ReadonlyMap<string, Buffer>,
  path: string,
  problems: string[],
): unknown {
  const data = files.get(path);
  if (data === undefined) return undefined;
  try {
    return JSON.parse(data.toString("utf8")) as unknown;
  } catch {
    problems.push(`invalid JSON in zip entry "${path}"`);
    return undefined;
  }
}

export function checkPack(zipBytes: Buffer, manifest: PackManifest): string[] {
  const problems: string[] = [];

  const actualSha1 = createHash("sha1").update(zipBytes).digest("hex");
  if (actualSha1 !== manifest.sha1) {
    problems.push(
      `sha1 mismatch: manifest declares ${manifest.sha1} but the zip hashes to ${actualSha1}`,
    );
  }

  let files: Map<string, Buffer>;
  try {
    files = unzipPack(zipBytes);
  } catch (err) {
    problems.push(`zip is unreadable: ${err instanceof Error ? err.message : String(err)}`);
    return problems;
  }

  const declared: readonly string[] = Array.isArray(manifest.contents) ? manifest.contents : [];
  const declaredSet = new Set(declared);
  for (const path of declared) {
    if (!files.has(path))
      problems.push(`missing file in zip: "${path}" is declared in the manifest but absent`);
  }
  for (const path of files.keys()) {
    if (!declaredSet.has(path)) {
      problems.push(
        `undeclared file in zip: "${path}" is present but not declared in the manifest`,
      );
    }
  }

  // Model JSON -> texture references.
  for (const [path, data] of files) {
    if (!/^assets\/[^/]+\/models\/.+\.json$/.test(path)) continue;
    let model: unknown;
    try {
      model = JSON.parse(data.toString("utf8")) as unknown;
    } catch {
      problems.push(`invalid JSON in zip entry "${path}"`);
      continue;
    }
    const textures =
      model !== null && typeof model === "object"
        ? (model as { textures?: unknown }).textures
        : undefined;
    if (textures === null || typeof textures !== "object") continue;
    for (const [slot, ref] of Object.entries(textures as Record<string, unknown>)) {
      if (typeof ref !== "string") continue;
      // A model texture value may carry a "#..." suffix in vanilla
      // models; the packs this project generates never do, but a
      // suffix does not change which file must exist.
      const texId = ref.split("#")[0] as string;
      const texPath = textureZipPath(texId);
      if (texPath === null) {
        problems.push(`model "${path}" texture "${slot}" has a malformed texture id "${ref}"`);
      } else if (!files.has(texPath)) {
        problems.push(
          `model "${path}" references missing texture "${ref}" (expected zip entry "${texPath}")`,
        );
      }
    }
  }

  // Font definitions: duplicate characters + texture references.
  for (const path of files.keys()) {
    if (!/^assets\/[^/]+\/font\/.+\.json$/.test(path)) continue;
    const font = parseJsonEntry(files, path, problems);
    if (font === undefined) continue;
    const providers =
      font !== null && typeof font === "object"
        ? (font as { providers?: unknown }).providers
        : undefined;
    if (!Array.isArray(providers)) continue;
    const seenChars = new Map<string, number>();
    for (const [index, provider] of providers.entries()) {
      if (provider === null || typeof provider !== "object") continue;
      const p = provider as { type?: unknown; file?: unknown; chars?: unknown };
      if (Array.isArray(p.chars)) {
        for (const ch of p.chars) {
          if (typeof ch !== "string") continue;
          for (const c of ch) {
            const count = (seenChars.get(c) ?? 0) + 1;
            seenChars.set(c, count);
            if (count === 2) {
              problems.push(
                `duplicate font character ${JSON.stringify(c)} in font "${path}" (provider ${index} repeats it)`,
              );
            }
          }
        }
      }
      if (p.type === "bitmap" && typeof p.file === "string") {
        const colon = p.file.indexOf(":");
        if (colon !== -1) {
          const ns = p.file.slice(0, colon);
          const rest = p.file.slice(colon + 1);
          const texPath = `assets/${ns}/textures/${rest}`;
          if (!files.has(texPath)) {
            problems.push(
              `font "${path}" provider ${index} references missing texture "${p.file}" (expected zip entry "${texPath}")`,
            );
          }
        }
      }
    }
  }

  // PNG-source textures: IHDR dimensions vs the manifest record.
  const textures = Array.isArray(manifest.textures) ? manifest.textures : [];
  for (const tex of textures) {
    if (tex.source !== "png") continue;
    const texPath = textureZipPath(tex.id);
    if (texPath === null) {
      problems.push(`manifest texture "${tex.id}" has a malformed id`);
      continue;
    }
    const data = files.get(texPath);
    if (data === undefined) continue; // already reported as missing
    try {
      const dims = pngDimensions(data, `texture "${tex.id}" in zip`);
      if (dims.width !== tex.width || dims.height !== tex.height) {
        problems.push(
          `texture "${tex.id}" IHDR dimensions ${dims.width}x${dims.height} do not match the manifest record ${tex.width}x${tex.height}`,
        );
      }
    } catch (err) {
      problems.push(
        `texture "${tex.id}" in zip is not a valid PNG: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return problems;
}
