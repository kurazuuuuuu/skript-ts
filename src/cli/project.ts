import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { emitIr, emitWithMap, isEngineOnlyScript, type Script } from "../index.js";
import { generatePack, type PackManifest } from "../packgen.js";
import {
  allocateCustomModelData,
  emptyRegistry,
  parseRegistry,
  serializeRegistry,
  type CustomModelDataRequest,
} from "../packregistry.js";
import { parseResourceId, type PackDef } from "../resourcepack.js";
import { typescriptBinPath } from "./toolchain.js";
import { buildCustomItemTable, resolveCustomItems, type ResolvedCustomItem } from "../resolve.js";
import type { SourceMapFile } from "../source-map.js";

export interface BuiltScript {
  /** Path of the .sk file relative to the scripts folder, e.g. "welcome.sk". */
  rel: string;
  /**
   * True for scripts using engine-builtin features (e.g. the MundoSK
   * slice): they have an IR form but no `.sk` form, so skPath / mapPath
   * / map are null and Skript-mode deployment skips them.
   */
  engineOnly: boolean;
  /** Absolute path of the emitted .sk in the output dir (null when engine-only). */
  skPath: string | null;
  /** Absolute path of the source map JSON next to the .sk (null when engine-only). */
  mapPath: string | null;
  map: SourceMapFile | null;
  /** Path of the IR file relative to the engine scripts folder, e.g. "welcome.ir.json". */
  irRel: string;
  /** Absolute path of the emitted IR JSON in the output dir. */
  irPath: string;
}

export interface BuiltPack {
  /** Pack namespace from definePack(). */
  namespace: string;
  /** Absolute path of the generated resource pack .zip in the output dir. */
  zipPath: string;
  /** Absolute path of the pack manifest JSON next to the zip. */
  manifestPath: string;
  manifest: PackManifest;
}

export interface BuildResult {
  scripts: BuiltScript[];
  /** Source files that exported no Script and were skipped. */
  skipped: string[];
  /** Source maps keyed by .sk rel path, for error mapping. */
  maps: Map<string, SourceMapFile>;
  /** Resource packs generated from exported PackDef values (at most one). */
  packs: BuiltPack[];
}

function isScript(value: unknown): value is Script {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { kind?: unknown }).kind === "script" &&
    Array.isArray((value as { body?: unknown }).body)
  );
}

function isPack(value: unknown): value is PackDef {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { kind?: unknown }).kind === "resourcepack" &&
    typeof (value as { namespace?: unknown }).namespace === "string"
  );
}

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "behavior" || entry === "node_modules") continue;
      out.push(...listTsFiles(full));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out.sort();
}

function toPosix(p: string): string {
  return p.split(sep).join("/");
}

/**
 * Load every TypeScript script module under srcDir, emit .sk files and
 * source maps into outDir. Convention: one TS file = one .sk file with
 * the same relative path and name; a module must export exactly one
 * Script value (default or named). Files exporting none are skipped.
 */
export async function buildProject(opts: {
  rootDir: string;
  srcDir: string;
  outDir: string;
  ignore: readonly string[];
  onFile?: (relSource: string) => void;
}): Promise<BuildResult> {
  const { rootDir, srcDir, outDir } = opts;
  const scripts: BuiltScript[] = [];
  const skipped: string[] = [];
  const maps = new Map<string, SourceMapFile>();
  const foundPacks: { pack: PackDef; moduleDir: string; relSource: string }[] = [];

  // Pass 1: import every module once, collecting packs and scripts.
  // The pack must be known before any script is emitted, because
  // RP-2 `customItem` references resolve against it (and against
  // the persisted CustomModelData registry) during emission.
  const loaded: { absFile: string; relSource: string; prog: Script | null }[] = [];
  for (const absFile of listTsFiles(srcDir)) {
    if (opts.ignore.includes(basename(absFile))) continue;
    const relSource = toPosix(relative(rootDir, absFile));
    opts.onFile?.(relSource);
    const mod = (await import(pathToFileURL(absFile).href)) as Record<string, unknown>;
    for (const value of Object.values(mod)) {
      if (isPack(value)) {
        foundPacks.push({ pack: value, moduleDir: dirname(absFile), relSource });
      }
    }
    const found = Object.values(mod).filter(isScript);
    if (found.length === 0) {
      skipped.push(relSource);
      loaded.push({ absFile, relSource, prog: null });
      continue;
    }
    if (found.length > 1) {
      throw new Error(
        `${relSource}: exports ${found.length} Script values; exactly one is required (1 TS file = 1 .sk file)`,
      );
    }
    loaded.push({ absFile, relSource, prog: found[0] as Script });
  }

  // RP-2: allocate CustomModelData numbers for the pack's items
  // (append-only registry, persisted at the project root) and build
  // the custom-item resolution table. With no pack, scripts are
  // still walked against an empty table so a stray customItem
  // reference fails the build instead of emitting unresolved.
  const packSingle = singlePack(foundPacks);
  let customItemTable: ReadonlyMap<string, ResolvedCustomItem> = new Map();
  let customItemNamespace = "minecraft";
  let packAllocations: ReadonlyMap<string, number> = new Map();
  if (packSingle !== null) {
    const allocated = allocatePackItems(rootDir, packSingle.pack, packSingle.relSource);
    packAllocations = allocated;
    customItemTable = buildCustomItemTable(packSingle.pack, allocated);
    customItemNamespace = packSingle.pack.namespace;
  }

  for (const { absFile, relSource, prog: rawProg } of loaded) {
    if (rawProg === null) continue;
    const prog = resolveCustomItems(rawProg, customItemTable, relSource, customItemNamespace);
    const relSk = toPosix(relative(srcDir, absFile)).replace(/\.ts$/, ".sk");
    const irRel = relSk.replace(/\.sk$/, ".ir.json");
    const irPath = join(outDir, irRel);
    // The output directory may not exist yet on a fresh clone
    // (the .sk write below already guards its own directory).
    mkdirSync(dirname(irPath), { recursive: true });
    writeFileSync(irPath, emitIr(prog), "utf8");
    if (isEngineOnlyScript(prog)) {
      // Engine-builtin features have no .sk form: emit IR only. The
      // script still counts as built (the engine load check expects
      // every built script), but Skript deployment skips it.
      scripts.push({
        rel: relSk,
        engineOnly: true,
        skPath: null,
        mapPath: null,
        map: null,
        irRel,
        irPath,
      });
      continue;
    }
    const { code, lines } = emitWithMap(prog);
    // Relativize captured TS call sites against the project root for readable
    // maps/reports; keep the absolute path for sources outside the root.
    const relLines = lines.map((l) => {
      if (l.ts === undefined) return l;
      const rel = toPosix(relative(rootDir, resolve(l.ts.file)));
      return { ...l, ts: { ...l.ts, file: rel.startsWith("../") ? l.ts.file : rel } };
    });
    const map: SourceMapFile = {
      version: 1,
      file: relSk,
      source: relSource,
      lines: relLines,
    };
    const skPath = join(outDir, relSk);
    mkdirSync(dirname(skPath), { recursive: true });
    writeFileSync(skPath, code, "utf8");
    const mapPath = `${skPath}.map.json`;
    writeFileSync(mapPath, JSON.stringify(map, null, 2) + "\n", "utf8");
    scripts.push({ rel: relSk, engineOnly: false, skPath, mapPath, map, irRel, irPath });
    maps.set(relSk, map);
  }
  return { scripts, skipped, maps, packs: buildPacks(foundPacks, outDir, packAllocations) };
}

/** The project's single pack, or null. Multiple packs are a build error. */
function singlePack(
  foundPacks: { pack: PackDef; moduleDir: string; relSource: string }[],
): { pack: PackDef; moduleDir: string; relSource: string } | null {
  if (foundPacks.length === 0) return null;
  if (foundPacks.length > 1) {
    const sources = foundPacks.map((f) => f.relSource).join(", ");
    throw new Error(
      `multiple resource packs exported (${sources}); only one pack per project is supported`,
    );
  }
  return foundPacks[0] as { pack: PackDef; moduleDir: string; relSource: string };
}

/** File name of the persisted CustomModelData registry at the project root. */
const REGISTRY_FILE = "resourcepack-registry.json";

/**
 * Allocate CustomModelData numbers for every item of the pack
 * (RP-2). The registry persists name -> number assignments at the
 * project root (`resourcepack-registry.json`): allocations are
 * append-only, a deleted definition's number stays reserved
 * forever, and an explicit number in a definition that collides
 * with any existing assignment is a build error. The registry is
 * written back only when a new allocation happened.
 */
function allocatePackItems(
  rootDir: string,
  pack: PackDef,
  relSource: string,
): ReadonlyMap<string, number> {
  const registryPath = join(rootDir, REGISTRY_FILE);
  let registry = emptyRegistry();
  if (existsSync(registryPath)) {
    try {
      registry = parseRegistry(readFileSync(registryPath, "utf8"));
    } catch (err) {
      throw new Error(
        `${relSource}: cannot use ${REGISTRY_FILE}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  const requests: CustomModelDataRequest[] = pack.items.map((item) => {
    const id = parseResourceId(item.id, pack.namespace);
    return {
      id: `${id.namespace}:${id.path}`,
      ...(item.customModelData !== undefined ? { customModelData: item.customModelData } : {}),
    };
  });
  let result: ReturnType<typeof allocateCustomModelData>;
  try {
    result = allocateCustomModelData(registry, requests);
  } catch (err) {
    throw new Error(`${relSource}: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (result.changed) {
    writeFileSync(registryPath, serializeRegistry(result.registry), "utf8");
  }
  return result.allocations;
}

/**
 * Generate the project's resource pack (RP-1). At most one PackDef may
 * be exported across the whole source tree — multiple packs are a
 * recorded open question in the design, not silently merged. The zip
 * and its manifest land in the output dir next to the built scripts;
 * distribution (deploying / sending the pack) is a later phase, so
 * nothing here touches the server folders.
 */
function buildPacks(
  foundPacks: { pack: PackDef; moduleDir: string; relSource: string }[],
  outDir: string,
  allocations: ReadonlyMap<string, number>,
): BuiltPack[] {
  if (foundPacks.length === 0) return [];
  if (foundPacks.length > 1) {
    const sources = foundPacks.map((f) => f.relSource).join(", ");
    throw new Error(
      `multiple resource packs exported (${sources}); only one pack per project is supported`,
    );
  }
  const { pack, moduleDir, relSource } = foundPacks[0] as {
    pack: PackDef;
    moduleDir: string;
    relSource: string;
  };
  // PNG texture sources resolve against the defining file's directory.
  const generated = generatePack(
    pack,
    (pngPath) => {
      try {
        return readFileSync(resolve(moduleDir, pngPath));
      } catch {
        throw new Error(
          `${relSource}: cannot read PNG texture file "${pngPath}" ` +
            `(resolved against the defining file's directory)`,
        );
      }
    },
    { customModelData: allocations },
  );
  mkdirSync(outDir, { recursive: true });
  const zipPath = join(outDir, generated.manifest.zipFile);
  writeFileSync(zipPath, generated.zip);
  const manifestPath = join(outDir, `${pack.namespace}.resourcepack.json`);
  writeFileSync(manifestPath, JSON.stringify(generated.manifest, null, 2) + "\n", "utf8");
  return [{ namespace: pack.namespace, zipPath, manifestPath, manifest: generated.manifest }];
}

/** Run the project's TypeScript compiler in noEmit mode. */
export function runTypecheck(rootDir: string): { ok: boolean; output: string } {
  // The compiler binary comes from the toolchain resolution
  // (package first, project fallback — feedback A2); only the
  // tsconfig is the project's own.
  const tscBin = typescriptBinPath(rootDir);
  const res = spawnSync(
    process.execPath,
    [tscBin, "--noEmit", "-p", join(rootDir, "tsconfig.json")],
    {
      cwd: rootDir,
      encoding: "utf8",
      timeout: 300_000,
    },
  );
  const output = `${res.stdout ?? ""}${res.stderr ?? ""}`.trim();
  return { ok: res.status === 0, output };
}

const MANIFEST_NAME = ".skript-ts-manifest.json";

/**
 * Copy/write so the destination is never observed half-written: the
 * payload lands in a sibling temp file and is renamed over the
 * target (atomic on the same filesystem). Deploy targets sit in a
 * live server's folders where reload triggers read them back (the
 * engine polls marker files, phase 25), so a torn file must be
 * structurally impossible.
 */
function atomicCopyFileSync(source: string, target: string): void {
  const temp = `${target}.tmp-${process.pid}`;
  try {
    copyFileSync(source, temp);
    renameSync(temp, target);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
}

function atomicWriteFileSync(target: string, content: string): void {
  const temp = `${target}.tmp-${process.pid}`;
  try {
    writeFileSync(temp, content, "utf8");
    renameSync(temp, target);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
}

/**
 * Copy built .sk files into the server's Skript scripts folder.
 * Files deployed by a previous run but no longer built are removed
 * (tracked through a manifest file in the scripts folder).
 */
export function deployScripts(opts: {
  scripts: readonly BuiltScript[];
  serverScriptsDir: string;
}): { deployed: string[]; removed: string[] } {
  const { serverScriptsDir } = opts;
  mkdirSync(serverScriptsDir, { recursive: true });
  const manifestPath = join(serverScriptsDir, MANIFEST_NAME);
  let previous: string[] = [];
  if (existsSync(manifestPath)) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
      if (Array.isArray(parsed))
        previous = parsed.filter((x): x is string => typeof x === "string");
    } catch {
      previous = [];
    }
  }
  // Engine-only scripts have no .sk file: they are excluded from the
  // deployed set (and a stale .sk from an earlier build is removed by
  // the manifest sweep above, since their rel is not in `next`).
  const deployable = opts.scripts.filter((s) => !s.engineOnly);
  const next = deployable.map((s) => s.rel);
  const removed: string[] = [];
  for (const rel of previous) {
    if (!next.includes(rel)) {
      const target = join(serverScriptsDir, rel);
      if (existsSync(target)) {
        rmSync(target);
        removed.push(rel);
      }
    }
  }
  const deployed: string[] = [];
  for (const s of deployable) {
    const target = join(serverScriptsDir, s.rel);
    mkdirSync(dirname(target), { recursive: true });
    atomicCopyFileSync(s.skPath as string, target);
    deployed.push(s.rel);
  }
  atomicWriteFileSync(manifestPath, JSON.stringify(next, null, 2) + "\n");
  return { deployed, removed };
}

const IR_MANIFEST_NAME = ".skript-ts-ir-manifest.json";

/**
 * Copy built IR files into the engine plugin's scripts folder
 * (`plugins/skript-ts/scripts`). Same manifest discipline as
 * deployScripts: files deployed by a previous run but no longer built
 * are removed. The manifest name does not end in `.ir.json`, so the
 * engine never tries to load it as a script.
 */
export function deployEngineScripts(opts: {
  scripts: readonly BuiltScript[];
  engineScriptsDir: string;
}): { deployed: string[]; removed: string[] } {
  const { engineScriptsDir } = opts;
  mkdirSync(engineScriptsDir, { recursive: true });
  const manifestPath = join(engineScriptsDir, IR_MANIFEST_NAME);
  let previous: string[] = [];
  if (existsSync(manifestPath)) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
      if (Array.isArray(parsed))
        previous = parsed.filter((x): x is string => typeof x === "string");
    } catch {
      previous = [];
    }
  }
  const next = opts.scripts.map((s) => s.irRel);
  const removed: string[] = [];
  for (const rel of previous) {
    if (!next.includes(rel)) {
      const target = join(engineScriptsDir, rel);
      if (existsSync(target)) {
        rmSync(target);
        removed.push(rel);
      }
    }
  }
  const deployed: string[] = [];
  for (const s of opts.scripts) {
    const target = join(engineScriptsDir, s.irRel);
    mkdirSync(dirname(target), { recursive: true });
    atomicCopyFileSync(s.irPath, target);
    deployed.push(s.irRel);
  }
  atomicWriteFileSync(manifestPath, JSON.stringify(next, null, 2) + "\n");
  return { deployed, removed };
}
