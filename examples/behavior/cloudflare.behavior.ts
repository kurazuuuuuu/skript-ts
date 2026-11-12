import { createServer, type Server } from "node:http";
import type { Socket } from "node:net";
import { defineBehavior } from "../../src/behavior.js";

// Cloudflare D1 slice of cloudflare.ts (engine-only, M4 CF-1).
// Under Skript mode the script is not deployed, so there is
// nothing to exercise. Under the engine it runs only when the
// verify process environment carries SKRIPTTS_CF_API_BASE_URL:
// the engine resolves the same variable at JVM start and points
// its Cloudflare client at the stub below, so without it this
// test passes without running (an environment gate, like the
// sandbox config.json fixture that gates the http test). No real
// Cloudflare account is touched; the stub implements just the D1
// query endpoint's shapes and proves parameter binding by
// refusing any request whose value leaked into the SQL text.
//
// The verification environment also sets:
//   SKRIPTTS_CF_TOKEN=test-token
//   SKRIPTTS_CF_ACCOUNT_ID=test-account
//   SKRIPTTS_CF_D1_DATABASE_ID=test-db
//   SKRIPTTS_CF_BADAUTH_TOKEN=wrong-token
//   SKRIPTTS_CF_BADAUTH_ACCOUNT_ID=test-account
//   SKRIPTTS_CF_BADAUTH_D1_DATABASE_ID=test-db
// Handle "bogus" has no variables at all, so it must complete
// with error kind "policy" before any request is made.

const CF_PORT = 8794;

/** A minimal D1 stub: one in-memory table behind the query endpoint. */
function startCfStub(): Promise<{ server: Server; sockets: Set<Socket> }> {
  const rows: Array<{ id: number; body: unknown }> = [];
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

      if (
        req.method !== "POST" ||
        req.url !== "/client/v4/accounts/test-account/d1/database/test-db/query"
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
      const rawSql = String(payload.sql ?? "");
      const sql = rawSql.trim().toLowerCase();
      const params = payload.params;

      if (sql.startsWith("create table")) {
        sendOk({ results: [], success: true, meta: { changes: 0, rows_read: 0, rows_written: 0 } });
        return;
      }
      if (sql.startsWith("insert into notes")) {
        // The binding proof: the value must arrive in params, and
        // the SQL text must not contain it. An inlined value (it
        // contains a quote) fails the whole run here.
        if (
          rawSql.includes("it's") ||
          !Array.isArray(params) ||
          params.length !== 1 ||
          params[0] !== "it's bound"
        ) {
          sendError(400, 7500, "parameter was not bound");
          return;
        }
        rows.push({ id: rows.length + 1, body: params[0] });
        sendOk({ results: [], success: true, meta: { changes: 1, rows_read: 0, rows_written: 1 } });
        return;
      }
      if (sql.startsWith("select id, body from notes")) {
        sendOk({
          results: rows,
          success: true,
          meta: { changes: 0, rows_read: rows.length, rows_written: 0 },
        });
        return;
      }
      if (sql.startsWith("select count(*) as total")) {
        sendOk({
          results: [{ total: rows.length }],
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
    server.listen(CF_PORT, "127.0.0.1", () => resolve({ server, sockets }));
  });
}

export default defineBehavior(async (t) => {
  if (t.mode !== "engine") return; // engine-only features; see header comment
  if (!process.env.SKRIPTTS_CF_API_BASE_URL) return; // environment gate; see header comment
  const stub = await startCfStub();
  const bot = await t.connect("CfBot");
  // Commands go out about a second apart: each query resolves
  // through the async response event, and spacing them keeps the
  // expected broadcasts unambiguous.
  const step = async (cmd: string, expect: string): Promise<void> => {
    bot.chat(cmd);
    await bot.waitForMessage(expect);
    await t.sleep(1000);
  };
  try {
    await step("/cfcreate", "cf[create] ok");
    await step("/cfadd", "cf[add] ok added 1");
    await step("/cfread", "cf[read] rows 1 first it's bound");
    await step("/cfcount", "cf[count] total 1");
    await step("/cfbadsql", "cf[badsql] error api");
    await step("/cfbadhandle", "cf[badhandle] error policy");
    await step("/cfauth", "cf[auth] error auth");
  } finally {
    bot.disconnect();
    for (const s of stub.sockets) s.destroy();
    stub.server.close();
  }
});
