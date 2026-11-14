import { mkdtempSync, readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  broadcast,
  cfR2Delete,
  cfR2Get,
  cfR2Head,
  cfR2List,
  cfR2Presign,
  cfR2Put,
  cfR2Size,
  cfSignedUrl,
  command,
  emit,
  emitIr,
  equals,
  fmt,
  ifElse,
  isEngineOnlyScript,
  num,
  onCfResponse,
  onResourcePackStatus,
  packRequired,
  packSha1,
  player,
  resourcePackStatus,
  script,
  send,
  sendResourcePack,
  str,
  variable,
} from "../src/index.js";
import { deployPacks, type BuiltPack } from "../src/cli/project.js";
import { packdistScript } from "../examples/packdist.js";
import { welcomeScript } from "../examples/welcome.js";

type Node = Record<string, unknown> & { kind?: string; event?: string };

function findNode(value: unknown, predicate: (node: Node) => boolean): Node | undefined {
  if (value === null || typeof value !== "object") return undefined;
  if (!Array.isArray(value)) {
    const node = value as Node;
    if (predicate(node)) return node;
  }
  for (const child of Object.values(value)) {
    const found = findNode(child, predicate);
    if (found) return found;
  }
  return undefined;
}

function irOf(build: () => unknown): unknown {
  return JSON.parse(emitIr(build() as never));
}

describe("cloudflare r2 builtin slice (CF-3, engine-only)", () => {
  it("builds cfR2 statement IR nodes in the cfD1Query shape", () => {
    const ir = irOf(() =>
      script(
        command("x", null, [
          cfR2Put("up", "packs", str("b"), str("k.zip"), str("packs/k.zip")),
          cfR2Get("dl", "packs", str("b"), str("k.zip"), str("packs/k.zip"), {
            timeoutSeconds: 30,
          }),
          cfR2Head("hd", "packs", str("b"), str("k.zip")),
          cfR2Delete("del", "packs", str("b"), str("k.zip")),
          cfR2List("ls", "packs", str("b"), str("packs/"), variable("keys")),
          cfR2Presign("sign", "packs", str("b"), str("k.zip"), 3600),
        ]),
      ),
    );
    const put = findNode(ir, (n) => n.kind === "cfR2Put");
    expect(put?.["id"]).toBe("up");
    expect(put?.["handle"]).toBe("packs");
    expect((put?.["bucket"] as Node)?.kind).toBe("string");
    expect((put?.["path"] as Node)?.value).toBe("packs/k.zip");
    const get = findNode(ir, (n) => n.kind === "cfR2Get");
    expect(get?.["timeoutSeconds"]).toBe(30);
    expect(findNode(ir, (n) => n.kind === "cfR2Head")?.["id"]).toBe("hd");
    expect(findNode(ir, (n) => n.kind === "cfR2Delete")?.["id"]).toBe("del");
    const list = findNode(ir, (n) => n.kind === "cfR2List");
    expect((list?.["prefix"] as Node)?.value).toBe("packs/");
    expect((list?.["store"] as Node)?.kind).toBe("variable");
    const presign = findNode(ir, (n) => n.kind === "cfR2Presign");
    expect(presign?.["ttlSeconds"]).toEqual({ kind: "number", value: 3600 });
  });

  it("rejects invalid cfR2 arguments like cfD1Query does", () => {
    expect(() => cfR2Put("", "packs", str("b"), str("k"), str("p"))).toThrow(RangeError);
    expect(() => cfR2Head("h", " ", str("b"), str("k"))).toThrow(RangeError);
    expect(() =>
      cfR2Get("g", "packs", str("b"), str("k"), str("p"), { timeoutSeconds: 0 }),
    ).toThrow(RangeError);
    expect(() =>
      cfR2List("l", "packs", str("b"), undefined, undefined, { timeoutSeconds: 121 }),
    ).toThrow(RangeError);
  });

  it("validates the presign ttl range only for literals", () => {
    expect(() => cfR2Presign("s", "packs", str("b"), str("k"), 59)).toThrow(RangeError);
    expect(() => cfR2Presign("s", "packs", str("b"), str("k"), 604801)).toThrow(RangeError);
    expect(() => cfR2Presign("s", "packs", str("b"), str("k"), num(30))).toThrow(RangeError);
    expect(() => cfR2Presign("s", "packs", str("b"), str("k"), 60)).not.toThrow();
    expect(() => cfR2Presign("s", "packs", str("b"), str("k"), 604800)).not.toThrow();
    // A non-literal numeric expression is a runtime value: no build check.
    expect(() => cfR2Presign("s", "packs", str("b"), str("k"), variable("ttl"))).not.toThrow();
  });

  it("exposes cfSignedUrl / cfR2Size accessors inside cfResponse", () => {
    const s = script(
      onCfResponse([
        ifElse(equals(cfSignedUrl(), str("x")), [broadcast(fmt("size ", cfR2Size()))], []),
      ]),
    );
    const ir = JSON.parse(emitIr(s)) as unknown;
    expect(findNode(ir, (n) => n.kind === "cfSignedUrl")).toBeDefined();
    expect(findNode(ir, (n) => n.kind === "cfR2Size")).toBeDefined();
    expect(isEngineOnlyScript(s)).toBe(true);
    expect(() => emit(s)).toThrow();
  });
});

describe("resource pack distribution slice (RP-3, engine-only)", () => {
  it("builds pack accessor and sendResourcePack IR nodes", () => {
    const s = script(
      command("x", null, [
        sendResourcePack(player(), str("https://example.invalid/p.zip"), packSha1("example"), {
          required: packRequired("example"),
          prompt: "hello",
        }),
      ]),
    );
    const ir = JSON.parse(emitIr(s)) as unknown;
    const sendNode = findNode(ir, (n) => n.kind === "sendResourcePack");
    expect((sendNode?.["sha1"] as Node)?.kind).toBe("packSha1");
    expect((sendNode?.["requiredExpr"] as Node)?.kind).toBe("packRequired");
    expect((sendNode?.["prompt"] as Node)?.value).toBe("hello");
    expect(isEngineOnlyScript(s)).toBe(true);
    expect(() => emit(s)).toThrow();
  });

  it("accepts a literal sha1 and a boolean required flag", () => {
    const sha = "0123456789abcdef0123456789abcdef01234567";
    const s = script(
      command("x", null, [
        sendResourcePack(player(), str("https://e.invalid/p"), sha, { required: true }),
      ]),
    );
    const ir = JSON.parse(emitIr(s)) as unknown;
    const sendNode = findNode(ir, (n) => n.kind === "sendResourcePack");
    expect((sendNode?.["sha1"] as Node)?.value).toBe(sha);
    expect(sendNode?.["required"]).toBe(true);
  });

  it("rejects malformed literal sha1 values and namespaces", () => {
    expect(() => sendResourcePack(player(), str("https://e.invalid/p"), "abc")).toThrow(RangeError);
    expect(() => sendResourcePack(player(), str("https://e.invalid/p"), str("zz"))).toThrow(
      RangeError,
    );
    expect(() => packSha1("")).toThrow(RangeError);
    expect(() => packRequired("  ")).toThrow(RangeError);
  });

  it("emits a resourcePackStatus event node with its accessor", () => {
    const s = script(onResourcePackStatus([send(player(), fmt("s ", resourcePackStatus()))]));
    const ir = JSON.parse(emitIr(s)) as unknown;
    expect(findNode(ir, (n) => n.event === "resourcePackStatus")).toBeDefined();
    expect(findNode(ir, (n) => n.kind === "resourcePackStatus")).toBeDefined();
    expect(isEngineOnlyScript(s)).toBe(true);
    expect(() => emit(s)).toThrow();
    expect(isEngineOnlyScript(welcomeScript)).toBe(false);
  });

  it("the packdist example is engine-only and uses the whole flow", () => {
    expect(isEngineOnlyScript(packdistScript)).toBe(true);
    const ir = JSON.parse(emitIr(packdistScript)) as unknown;
    for (const kind of ["cfR2Put", "cfR2Presign", "sendResourcePack"]) {
      expect(findNode(ir, (n) => n.kind === kind)).toBeDefined();
    }
    expect(findNode(ir, (n) => n.event === "resourcePackStatus")).toBeDefined();
  });
});

describe("deployPacks (RP-3)", () => {
  function fakePack(dir: string, namespace: string): BuiltPack {
    const zipPath = join(dir, `${namespace}.zip`);
    const manifestPath = join(dir, `${namespace}.resourcepack.json`);
    writeFileSync(zipPath, `zip-${namespace}`);
    writeFileSync(manifestPath, JSON.stringify({ namespace }));
    return {
      namespace,
      zipPath,
      manifestPath,
      manifest: {
        namespace,
        description: "",
        required: false,
        zipFile: `${namespace}.zip`,
        sha1: "0".repeat(40),
        size: 1,
        packFormat: [0, 0],
        contents: [],
        items: [],
      },
    };
  }

  it("copies zip + manifest and sweeps packs from a previous deploy", () => {
    const src = mkdtempSync(join(tmpdir(), "rp3-src-"));
    const dest = mkdtempSync(join(tmpdir(), "rp3-dest-"));
    const first = deployPacks({ packs: [fakePack(src, "example")], enginePacksDir: dest });
    expect(first.deployed.sort()).toEqual(["example.resourcepack.json", "example.zip"]);
    expect(readFileSync(join(dest, "example.zip"), "utf8")).toBe("zip-example");
    const second = deployPacks({ packs: [fakePack(src, "other")], enginePacksDir: dest });
    expect(second.removed.sort()).toEqual(["example.resourcepack.json", "example.zip"]);
    expect(existsSync(join(dest, "example.zip"))).toBe(false);
    expect(existsSync(join(dest, "other.zip"))).toBe(true);
    mkdirSync(join(dest, "scripts"), { recursive: true });
  });
});
