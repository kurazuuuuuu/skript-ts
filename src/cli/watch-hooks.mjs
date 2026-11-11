// Loader hooks for `skript-ts watch` (registered from watch.ts via
// node:module's register()). Plain JS on purpose: loader-thread code
// must not depend on the tsx transpiler that loads the CLI itself.
//
// Why this exists: buildProject loads user script modules with
// dynamic import(), and Node's ESM loader caches modules by URL, so
// a second in-process build round would silently reuse the first
// round's modules. Appending a per-round query token (`stsr=<n>`)
// to every resolved file: URL under the watched scripts root gives
// each round a fresh module graph, while modules shared by several
// scripts in the same round keep one identity (same token, same
// URL). Appending the token only to the entry module does NOT work:
// its relative imports resolve to the un-tokenized URL and stay
// cached (verified experimentally, phase 25).
//
// The current token is read synchronously from a token file at each
// resolve: deterministic (no cross-thread message races), and the
// watch loop bumps the file before every build round.
import { readFileSync } from "node:fs";

let tokenFile = null;
let rootPrefix = null;

export function initialize(data) {
  tokenFile = data.tokenFile;
  rootPrefix = data.rootPrefix;
}

export async function resolve(specifier, context, nextResolve) {
  const res = await nextResolve(specifier, context);
  if (
    tokenFile === null ||
    rootPrefix === null ||
    !res.url.startsWith("file:") ||
    !res.url.startsWith(rootPrefix)
  ) {
    return res;
  }
  const url = new URL(res.url);
  if (url.searchParams.has("stsr")) return res;
  let token = "0";
  try {
    token = readFileSync(tokenFile, "utf8").trim();
  } catch {
    // Token file unreadable: fall back to a constant token (the
    // first round still loads; later rounds may go stale, which the
    // watch loop surfaces as unchanged output rather than a crash).
  }
  url.searchParams.set("stsr", token);
  return { ...res, url: url.href };
}
