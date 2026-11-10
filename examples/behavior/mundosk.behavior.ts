import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { Socket } from "node:net";
import { defineBehavior } from "../../src/behavior.js";

// mundosk.ts is engine-only (MundoSK builtin slice: the websocket
// client lives in the skript-ts engine jar), so under Skript mode
// there is nothing to exercise and this test passes without running.
// Under the engine it drives the full chain against a local RFC 6455
// echo server implemented below with Node builtins:
//   /wsconnect -> engine connects -> onWsOpen sends a greeting ->
//   echo server returns it -> onWsMessage broadcasts it -> the bot
//   sees the broadcast. Then /wsclose disconnects and the close event
//   broadcasts. (The world-border slice has its own test file,
//   mundosk-border.behavior.ts.)
//
// Environment note: the engine initiates a real outbound TCP
// connection for the websocket, so this test needs the sandbox to
// allow direct TCP (Muse "other_tcp" permission). Where that is
// denied, the connect fails cleanly through the engine's error path
// and this test times out on the first assertion.

const WS_PORT = 8791;
const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

function encodeTextFrame(text: string): Buffer {
  const payload = Buffer.from(text, "utf8");
  const len = payload.length;
  let header: Buffer;
  if (len < 126) {
    header = Buffer.from([0x81, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

/** A minimal echo server: enough of RFC 6455 for one client. */
function startEchoServer(): Promise<{ server: Server; sockets: Set<Socket>; port: number }> {
  const sockets = new Set<Socket>();
  const server = createServer();
  server.on("upgrade", (req, socket: Socket) => {
    const key = req.headers["sec-websocket-key"];
    if (typeof key !== "string") {
      socket.destroy();
      return;
    }
    const accept = createHash("sha1").update(key + WS_GUID).digest("base64");
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\n" +
        "Upgrade: websocket\r\n" +
        "Connection: Upgrade\r\n" +
        `Sec-WebSocket-Accept: ${accept}\r\n` +
        "\r\n",
    );
    sockets.add(socket);
    let buffer = Buffer.alloc(0);
    let fragments: Buffer[] = [];
    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      for (;;) {
        if (buffer.length < 2) return;
        const fin = (buffer[0] as number) & 0x80;
        const opcode = (buffer[0] as number) & 0x0f;
        const masked = ((buffer[1] as number) & 0x80) !== 0;
        let len = (buffer[1] as number) & 0x7f;
        let offset = 2;
        if (len === 126) {
          if (buffer.length < 4) return;
          len = buffer.readUInt16BE(2);
          offset = 4;
        } else if (len === 127) {
          if (buffer.length < 10) return;
          len = Number(buffer.readBigUInt64BE(2));
          offset = 10;
        }
        const maskLen = masked ? 4 : 0;
        if (buffer.length < offset + maskLen + len) return;
        let payload = buffer.subarray(offset + maskLen, offset + maskLen + len);
        if (masked) {
          const mask = buffer.subarray(offset, offset + 4);
          payload = Buffer.from(payload.map((b, i) => b ^ (mask[i % 4] as number)));
        }
        buffer = buffer.subarray(offset + maskLen + len);
        if (opcode === 0x8) {
          socket.write(Buffer.from([0x88, 0x00]));
          socket.end();
          return;
        }
        if (opcode === 0x9) {
          socket.write(Buffer.concat([Buffer.from([0x8a, payload.length]), payload]));
          continue;
        }
        if (opcode === 0x1 || opcode === 0x0) {
          fragments.push(payload);
          if (fin) {
            const whole = Buffer.concat(fragments);
            fragments = [];
            socket.write(encodeTextFrame(whole.toString("utf8")));
          }
        }
      }
    });
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => sockets.delete(socket));
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(WS_PORT, "127.0.0.1", () => resolve({ server, sockets, port: WS_PORT }));
  });
}

export default defineBehavior(async (t) => {
  if (t.mode !== "engine") return; // engine-only features; see header comment
  const echo = await startEchoServer();
  const bot = await t.connect("MundoBot");
  try {
    bot.chat("/wsconnect");
    await bot.waitForMessage("ws[echo] hello from skript-ts");
    bot.chat("/wsclose");
    await bot.waitForMessage("ws closed: echo");
  } finally {
    bot.disconnect();
    for (const s of echo.sockets) s.destroy();
    echo.server.close();
  }
});
