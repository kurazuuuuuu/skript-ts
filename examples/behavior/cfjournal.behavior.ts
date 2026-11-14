import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { Socket } from "node:net";
import { join } from "node:path";
import { defineBehavior } from "../../src/behavior.js";

// Integrated Cloudflare sample (M4 CF-4): examples/cfjournal.ts
// joins D1 and R2 in one flow. Engine-only, and gated on TWO
// environment variables, because the suite runs TWO stubs:
//
//   SKRIPTTS_CF_API_BASE_URL        the D1 stub's base URL
//                                   (its port hosts the D1 stub)
//   SKRIPTTS_CF_JOURNAL_R2_ENDPOINT the S3 stub's base URL for
//                                   the script's "journal" handle
//
// The engine resolves the same variables at JVM start (plus
// SKRIPTTS_CF_TOKEN / SKRIPTTS_CF_ACCOUNT_ID /
// SKRIPTTS_CF_D1_DATABASE_ID for the "default" handle and
// SKRIPTTS_CF_JOURNAL_ACCOUNT_ID /
// SKRIPTTS_CF_JOURNAL_R2_ACCESS_KEY_ID /
// SKRIPTTS_CF_JOURNAL_R2_SECRET_ACCESS_KEY for "journal"), so
// without them this test passes without running. No real
// Cloudflare account is touched.
//
// The D1 stub keeps one in-memory pack_events table behind the
// query endpoint and proves parameter binding the same way the
// cloudflare suite does: an insert whose player name leaked
// into the SQL text is refused. The S3 stub is the packdist
// suite's minimal store (signatures unverified there and here).
//
// Flow asserted here:
//   bot joins -> the script creates its table, journals the
//   join and uploads packs/example.zip (stub PUT) -> presign
//   completes -> the bot is offered the pack -> the test
//   downloads the offered URL itself and checks the SHA-1
//   against the pack manifest the build produced (and the hash
//   in the offer packet) -> the bot answers accepted ->
//   downloaded -> successfully_loaded, each status comes back
//   as a "cfjournal status ..." message, and the final one is
//   journaled -> /cfjstats reports "cfjournal joins 1" and
//   "cfjournal pack loads 1" back out of the D1 stub.

/** A minimal D1 stub: one in-memory pack_events table. */
function startD1Stub(port: number): Promise<{ server: Server; sockets: Set<Socket> }> {
  const rows: Array<{ player: unknown; kind: string }> = [];
  const sockets = new Set<Socket>();
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const sendJson = (status: number, body: unknown): void => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
      };
      const sendError = (status: number, code: number, message: string): void =>
        sendJson(status, { success: false, errors: [{ code, message }], result: null });
      const sendOk = (inner: unknown): void =>
        sendJson(200, { result: [inner], success: true, errors: [], messages: [] });

      const url = new URL(req.url ?? "/", "http://stub.invalid");
      if (
        req.method !== "POST" ||
        !url.pathname.endsWith("/accounts/test-account/d1/database/test-db/query")
      ) {
        sendError(404, 10013, "not found");
        return;
      }
      if (String(req.headers["authorization"] ?? "") !== "Bearer test-token") {
        sendError(401, 10000, "Authentication error");
        return;
      }

      let payload: { sql?: unknown; params?: unknown };
      try {
        payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
          sql?: unknown;
          params?: unknown;
        };
      } catch {
        sendError(400, 1001, "unrecognized sql");
        return;
      }
      const rawSql = typeof payload.sql === "string" ? payload.sql : "";
      const sql = rawSql.trim().toLowerCase();
      const params = payload.params;

      if (sql.startsWith("create table")) {
        sendOk({ results: [], success: true, meta: { changes: 0, rows_read: 0, rows_written: 0 } });
        return;
      }
      if (sql.startsWith("insert into pack_events")) {
        // The binding proof: the player name must arrive in
        // params, and the SQL text must not contain it.
        const value =
          Array.isArray(params) && params.length === 1 ? (params[0] as unknown) : undefined;
        if (typeof value !== "string" || rawSql.includes(value)) {
          sendError(400, 7500, "parameter was not bound");
          return;
        }
        const kind = rawSql.includes("'pack_loaded'")
          ? "pack_loaded"
          : rawSql.includes("'join'")
            ? "join"
            : null;
        if (kind === null) {
          sendError(400, 1001, "unrecognized sql");
          return;
        }
        rows.push({ player: value, kind });
        sendOk({ results: [], success: true, meta: { changes: 1, rows_read: 0, rows_written: 1 } });
        return;
      }
      if (sql.startsWith("select count(*) as total from pack_events")) {
        const kind = sql.includes("kind = 'join'") ? "join" : "pack_loaded";
        const total = rows.filter((r) => r.kind === kind).length;
        sendOk({
          results: [{ total }],
          success: true,
          meta: { changes: 0, rows_read: 1, rows_written: 0 },
        });
        return;
      }
      sendError(400, 1001, "unrecognized sql");
    });
  });
  server.on("connection", (s: Socket) => {
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve({ server, sockets }));
  });
}

interface StubObject {
  body: Buffer;
}

/** The packdist suite's minimal S3 store, unchanged in shape. */
function startS3Stub(port: number): Promise<{
  server: Server;
  sockets: Set<Socket>;
  objects: Map<string, StubObject>;
  puts: string[];
}> {
  const objects = new Map<string, StubObject>();
  const puts: string[] = [];
  const sockets = new Set<Socket>();
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const url = new URL(req.url ?? "/", "http://stub.invalid");
      const path = decodeURIComponent(url.pathname.replace(/^\//, ""));
      const body = Buffer.concat(chunks);
      if (req.method === "PUT") {
        objects.set(path, { body });
        puts.push(path);
        res.writeHead(200, { etag: '"stub-etag"' });
        res.end();
        return;
      }
      if (req.method === "GET" && url.searchParams.get("list-type") === "2") {
        const prefix = url.searchParams.get("prefix") ?? "";
        const bucket = path;
        const keys = [...objects.keys()]
          .filter((k) => k.startsWith(`${bucket}/`))
          .map((k) => k.slice(bucket.length + 1))
          .filter((k) => k.startsWith(prefix))
          .sort();
        const xml =
          `<?xml version="1.0" encoding="UTF-8"?>` +
          `<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">` +
          keys.map((k) => `<Contents><Key>${k}</Key></Contents>`).join("") +
          `</ListBucketResult>`;
        res.writeHead(200, { "content-type": "application/xml" });
        res.end(xml);
        return;
      }
      if (req.method === "GET" || req.method === "HEAD") {
        const object = objects.get(path);
        if (!object) {
          res.writeHead(404, { "content-type": "application/xml" });
          res.end(
            `<?xml version="1.0" encoding="UTF-8"?><Error><Code>NoSuchKey</Code><Message>stub: no such key</Message></Error>`,
          );
          return;
        }
        res.writeHead(200, { "content-length": String(object.body.length), etag: '"stub-etag"' });
        res.end(req.method === "GET" ? object.body : undefined);
        return;
      }
      if (req.method === "DELETE") {
        objects.delete(path);
        res.writeHead(204);
        res.end();
        return;
      }
      res.writeHead(400);
      res.end();
    });
  });
  server.on("connection", (s: Socket) => {
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve({ server, sockets, objects, puts }));
  });
}

export default defineBehavior(async (t) => {
  if (t.mode !== "engine") return; // engine-only features; see header comment
  const apiBase = process.env.SKRIPTTS_CF_API_BASE_URL;
  const endpoint = process.env.SKRIPTTS_CF_JOURNAL_R2_ENDPOINT;
  if (!apiBase || !endpoint) return; // environment gate; see header comment
  const d1 = await startD1Stub(Number(new URL(apiBase).port || 8794));
  const s3 = await startS3Stub(Number(new URL(endpoint).port || 8797));
  const bot = await t.connect("JournalBot");
  try {
    // The offer arrives after join -> put -> presign (two async
    // cfResponse hops), so poll for it.
    let offer: { url: string; hash: string | null } | undefined;
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      offer = bot.resourcePackOffers()[0];
      if (offer) break;
      await t.sleep(250);
    }
    if (!offer) {
      throw new Error(
        `no resource pack offer arrived; stub puts: ${JSON.stringify(s3.puts)}; messages: ${JSON.stringify(bot.messages.slice(-10))}`,
      );
    }
    if (s3.puts.length === 0) {
      throw new Error("the script never uploaded the pack to the stub");
    }

    // Download the offered (presigned) URL and check its SHA-1
    // against the build's pack manifest, when present, and the
    // hash the server declared in the offer packet.
    const response = await fetch(offer.url);
    if (!response.ok) throw new Error(`pack download failed: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const sha1 = createHash("sha1").update(bytes).digest("hex");
    const manifestPath = join(process.cwd(), "build", "example.resourcepack.json");
    if (existsSync(manifestPath)) {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { sha1?: string };
      if (manifest.sha1 !== sha1) {
        throw new Error(`downloaded pack sha1 ${sha1} != manifest sha1 ${String(manifest.sha1)}`);
      }
    }
    if (offer.hash && offer.hash.toLowerCase() !== sha1) {
      throw new Error(`downloaded pack sha1 ${sha1} != offer hash ${offer.hash}`);
    }

    // Answer in order and watch each status come back through
    // the script's onResourcePackStatus messages.
    for (const status of ["accepted", "downloaded", "successfully_loaded"]) {
      bot.answerResourcePack([status]);
      await bot.waitForMessage(`cfjournal status ${status}`);
      await t.sleep(250);
    }

    // The successfully_loaded answer made the script journal a
    // second event; give that insert a moment to land before
    // counting (D1 completions are asynchronous).
    await t.sleep(2000);

    bot.chat("/cfjstats");
    await bot.waitForMessage("cfjournal joins 1");
    await bot.waitForMessage("cfjournal pack loads 1");
  } finally {
    bot.disconnect();
    for (const s of d1.sockets) s.destroy();
    for (const s of s3.sockets) s.destroy();
    d1.server.close();
    s3.server.close();
  }
});
