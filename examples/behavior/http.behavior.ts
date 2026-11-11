import { createServer, type Server } from "node:http";
import type { Socket } from "node:net";
import { defineBehavior } from "../../src/behavior.js";

// HTTP / env slice of http.ts and env.ts (engine-only, phase 26).
// Under Skript mode neither script is deployed, so there is
// nothing to exercise and this test passes without running. Under
// the engine it drives the full chain against a local echo server
// implemented below with Node builtins only:
//   /envshow reads JVM environment variables -> /httphello and
//   friends fetch from the echo server -> onHttpResponse
//   broadcasts the outcome -> the bot sees the broadcast.
//
// Environment note: the engine initiates real outbound TCP
// connections for HTTP, so this test needs the sandbox to allow
// direct TCP (Muse "other_tcp" permission). Where that is
// denied, the success cases time out on the first assertion. The
// sandbox config.json must also enable
// http.allowPrivateAddresses, or the loopback echo server is
// refused by the engine's URL policy like any other private
// address. The policy cases (/httppolicy, /httpuserinfo) are
// refused before any connection, so they behave the same either
// way.

const HTTP_PORT = 8792;

/** A minimal echo server: fixed routes the http.ts commands aim at. */
function startEchoServer(): Promise<{ server: Server; sockets: Set<Socket> }> {
  const sockets = new Set<Socket>();
  const server = createServer((req, res) => {
    const url = req.url ?? "";
    if (url === "/hello") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("hello-http");
      return;
    }
    if (url === "/status/404") {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("missing-body");
      return;
    }
    if (url === "/redirect") {
      res.writeHead(302, { location: "/hello" });
      res.end();
      return;
    }
    if (url === "/big") {
      // 9 MiB: over the engine's 8 MiB body cap, so the fetch
      // resolves with error kind "size" instead of a body.
      res.writeHead(200, { "content-type": "text/plain" });
      res.end(Buffer.alloc(9 * 1024 * 1024, "x"));
      return;
    }
    if (url === "/slow") {
      // Answers long after the command's 2 second timeout; the
      // timer is dropped as soon as the client hangs up.
      const timer = setTimeout(() => {
        if (!res.destroyed) {
          res.writeHead(200, { "content-type": "text/plain" });
          res.end("slow-body");
        }
      }, 30_000);
      timer.unref();
      res.on("close", () => clearTimeout(timer));
      return;
    }
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("missing-body");
  });
  server.on("connection", (s: Socket) => {
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(HTTP_PORT, "127.0.0.1", () => resolve({ server, sockets }));
  });
}

export default defineBehavior(async (t) => {
  if (t.mode !== "engine") return; // engine-only features; see header comment
  const echo = await startEchoServer();
  const bot = await t.connect("HttpBot");
  // Commands go out about a second apart: each fetch resolves
  // through the async response event, and spacing them keeps the
  // expected broadcasts unambiguous.
  const step = async (cmd: string, expect: string): Promise<void> => {
    bot.chat(cmd);
    await bot.waitForMessage(expect);
    await t.sleep(1000);
  };
  try {
    // env first: PATH is set on any host the JVM runs on, while
    // the made-up name must read back as <none>.
    bot.chat("/envshow PATH");
    const pathMsg = await bot.waitForMessage("envval ");
    if (pathMsg.includes("envval <none>")) {
      throw new Error("PATH env var should be set, got: " + pathMsg);
    }
    await t.sleep(1000);
    await step("/envshow SKRIPT_TS_ABSENT_26", "envval <none>");

    await step("/httphello", "http[hello] status 200 body hello-http");
    await step("/httpmissing", "http[missing] status 404 body missing-body");
    await step("/httpredirect", "http[redir] status 200 body hello-http");
    await step("/httpbig", "http[big] error size");
    await step("/httpslow", "http[slow] error timeout");
    await step("/httppolicy", "http[pol] error policy");
    await step("/httpuserinfo", "http[ui] error policy");
    await step("/httpdl", "http[dl] ok dl/hello.txt");
    await step("/httpread", "dl text hello-http");
  } finally {
    bot.disconnect();
    for (const s of echo.sockets) s.destroy();
    echo.server.close();
  }
});
