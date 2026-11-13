// Toolchain resolution (feedback A2): the CLI's own dependencies
// (tsx, TypeScript) resolve from the skript-ts package, never from
// the caller's working directory — a consumer project needs no
// tsx / typescript of its own to launch the CLI or typecheck.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { packageRootDir, tsxLoaderUrl, typescriptBinPath } from "../src/cli/toolchain.js";

describe("toolchain resolution", () => {
  it("resolves the tsx loader inside this package", () => {
    const url = tsxLoaderUrl();
    expect(url.startsWith("file://")).toBe(true);
    const path = fileURLToPath(url);
    expect(path.startsWith(packageRootDir())).toBe(true);
    expect(existsSync(path)).toBe(true);
  });

  it("resolves the TypeScript compiler inside this package", () => {
    const bin = typescriptBinPath(packageRootDir());
    expect(bin.startsWith(packageRootDir())).toBe(true);
    expect(existsSync(bin)).toBe(true);
  });

  it("still resolves TypeScript when the project root has none of its own", () => {
    // A bare consumer root (no package.json, no node_modules) must
    // not break resolution: the package copy is the primary source.
    const bin = typescriptBinPath("/nonexistent-consumer-root");
    expect(existsSync(bin)).toBe(true);
  });
});
