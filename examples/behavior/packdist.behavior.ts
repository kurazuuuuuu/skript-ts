import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { Socket } from "node:net";
import { join } from "node:path";
import { defineBehavior } from "../../src/behavior.js";

// Resource-pack distribution (RP-3) over the R2 client (CF-3),
// engine-only. Under Skript mode the script is not deployed, so
// there is nothing to exercise. Under the engine it runs only
// when the verify process environment carries
// SKRIPTTS_CF_PACKS_R2_ENDPOINT pointing at the S3 stub below
// (plus SKRIPTTS_CF_PACKS_ACCOUNT_ID /
// SKRIPTTS_CF_PACKS_R2_ACCESS_KEY_ID /
// SKRIPTTS_CF_PACKS_R2_SECRET_ACCESS_KEY): the engine resolves
// the same variables at JVM start, so without them this test
// passes without running (an environment gate, like the
// cloudflare D1 test). No real Cloudflare account is touched.
//
// The stub is a minimal S3 store (PUT/GET/HEAD/DELETE plus
// ListObjectsV2); signatures are not verified — the point is the
// engine's request shapes, the presigned URL it hands out, and
// the pack/status flow around them, not SigV4 itself (the signer
// is exercised implicitly: the stub answers whatever arrives).
//
// Flow asserted here:
//   bot joins -> the script uploads packs/example.zip (stub PUT)
//   -> presign completes -> the bot is offered the pack -> the
//   test downloads the offered URL itself and checks the SHA-1
//   against the pack manifest the build produced (and the hash
//   the server put in the offer packet) -> the bot answers
//   accepted -> downloaded -> successfully_loaded, and each
//   status comes back through the script as a "pack status ..."
//   message to the player.
//
// Quota gate: when the verify environment ALSO sets
// SKRIPTTS_R2_QUOTA_TEST=1, the sandbox config.json is expected
// to carry a tiny cloudflare.r2MonthlyClassALimit (the join-time
// upload consumes it), and /packput must then complete with
// error kind "quota" without reaching the stub.

interface StubObject {
  body: Buffer;
}

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
  const endpoint = process.env.SKRIPTTS_CF_PACKS_R2_ENDPOINT;
  if (!endpoint) return; // environment gate; see header comment
  const port = Number(new URL(endpoint).port || 8795);
  const stub = await startS3Stub(port);
  const bot = await t.connect("PackBot");
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
        `no resource pack offer arrived; stub puts: ${JSON.stringify(stub.puts)}; messages: ${JSON.stringify(bot.messages.slice(-10))}`,
      );
    }
    if (stub.puts.length === 0) {
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
      await bot.waitForMessage(`pack status ${status}`);
      await t.sleep(250);
    }

    if (process.env.SKRIPTTS_R2_QUOTA_TEST) {
      bot.chat("/packput");
      await bot.waitForMessage("packdist[packput] error quota");
    }
  } finally {
    bot.disconnect();
    for (const s of stub.sockets) s.destroy();
    stub.server.close();
  }
});
