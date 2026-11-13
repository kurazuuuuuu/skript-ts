// Engine plugin-set coverage: the PlaceholderAPI jar deployed in
// engine mode is checksum-pinned (engine/libs/<jar>.sha512, written
// by engine/fetch-libs.sh), and installEngine must re-verify that
// pin at deploy time — a jar whose bits changed after fetching, or
// whose pin went missing, must never reach the sandbox.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  installEngine,
  PAPI_LIBS_JAR,
  PAPI_SANDBOX_JAR,
  verifyPinnedJar,
} from "../src/cli/engine.js";

const ENGINE_JAR_BYTES = Buffer.from("fake engine jar\n");
const PAPI_JAR_BYTES = Buffer.from("fake placeholderapi jar\n");

function sha512(bytes: Buffer): string {
  return createHash("sha512").update(bytes).digest("hex");
}

interface Layout {
  rootDir: string;
  serverDir: string;
  pluginsDir: string;
  papiLib: string;
  papiPin: string;
}

/** Root with a built engine jar and a server with an empty plugins dir. */
function makeLayout(tempDir: string): Layout {
  const rootDir = join(tempDir, "root");
  const serverDir = join(tempDir, "server");
  const pluginsDir = join(serverDir, "plugins");
  mkdirSync(join(rootDir, "engine", "build"), { recursive: true });
  mkdirSync(join(rootDir, "engine", "libs"), { recursive: true });
  mkdirSync(pluginsDir, { recursive: true });
  writeFileSync(join(rootDir, "engine", "build", "skript-ts.jar"), ENGINE_JAR_BYTES);
  return {
    rootDir,
    serverDir,
    pluginsDir,
    papiLib: join(rootDir, "engine", "libs", PAPI_LIBS_JAR),
    papiPin: join(rootDir, "engine", "libs", `${PAPI_LIBS_JAR}.sha512`),
  };
}

describe("installEngine PlaceholderAPI pin", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "skript-ts-engine-"));
  });

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("deploys PlaceholderAPI.jar when the jar matches its pinned SHA-512", () => {
    const layout = makeLayout(tempDir);
    writeFileSync(layout.papiLib, PAPI_JAR_BYTES);
    writeFileSync(layout.papiPin, `${sha512(PAPI_JAR_BYTES)}\n`);

    const result = installEngine(layout.rootDir, layout.serverDir);

    const deployed = join(layout.pluginsDir, PAPI_SANDBOX_JAR);
    expect(existsSync(deployed)).toBe(true);
    expect(readFileSync(deployed).equals(PAPI_JAR_BYTES)).toBe(true);
    expect(result.note).toContain("PlaceholderAPI.jar を配置");
  });

  it("refuses to deploy when the jar does not match the pinned SHA-512", () => {
    const layout = makeLayout(tempDir);
    writeFileSync(layout.papiLib, PAPI_JAR_BYTES);
    writeFileSync(layout.papiPin, `${sha512(Buffer.from("some other jar"))}\n`);

    expect(() => installEngine(layout.rootDir, layout.serverDir)).toThrow(/SHA-512 mismatch/);
    expect(existsSync(join(layout.pluginsDir, PAPI_SANDBOX_JAR))).toBe(false);
    // The pin is checked before the plugin set is touched.
    expect(existsSync(join(layout.pluginsDir, "skript-ts.jar"))).toBe(false);
  });

  it("refuses to deploy when the pinned checksum file is missing", () => {
    const layout = makeLayout(tempDir);
    writeFileSync(layout.papiLib, PAPI_JAR_BYTES);

    expect(() => installEngine(layout.rootDir, layout.serverDir)).toThrow(
      /pinned checksum file .* is missing/,
    );
    expect(existsSync(join(layout.pluginsDir, PAPI_SANDBOX_JAR))).toBe(false);
  });

  it("still installs the engine without PlaceholderAPI when the jar is absent", () => {
    const layout = makeLayout(tempDir);

    const result = installEngine(layout.rootDir, layout.serverDir);

    expect(existsSync(join(layout.pluginsDir, "skript-ts.jar"))).toBe(true);
    expect(existsSync(join(layout.pluginsDir, PAPI_SANDBOX_JAR))).toBe(false);
    expect(result.note).toContain("プレースホルダ機能は無効");
  });
});

describe("verifyPinnedJar", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "skript-ts-pin-"));
  });

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("accepts a sha512sum-style pin line (digest + file name)", () => {
    const jar = join(tempDir, "lib.jar");
    writeFileSync(jar, PAPI_JAR_BYTES);
    writeFileSync(`${jar}.sha512`, `${sha512(PAPI_JAR_BYTES)}  lib.jar\n`);

    expect(() => verifyPinnedJar(jar)).not.toThrow();
  });

  it("reports expected and actual digests on mismatch", () => {
    const jar = join(tempDir, "lib.jar");
    const wrong = sha512(Buffer.from("not this jar"));
    writeFileSync(jar, PAPI_JAR_BYTES);
    writeFileSync(`${jar}.sha512`, `${wrong}\n`);

    expect(() => verifyPinnedJar(jar)).toThrow(new RegExp(`expected: ${wrong}`));
    expect(() => verifyPinnedJar(jar)).toThrow(new RegExp(`actual:   ${sha512(PAPI_JAR_BYTES)}`));
  });
});
