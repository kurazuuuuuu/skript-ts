import {
  argument,
  borderSize,
  broadcast,
  command,
  fmt,
  onWsClose,
  onWsMessage,
  onWsOpen,
  player,
  script,
  send,
  setBorderSize,
  str,
  worldOf,
  wsConnect,
  wsDisconnect,
  wsId,
  wsMessage,
  wsSend,
} from "../src/index.js";
import type { Script } from "../src/index.js";

// MundoSK builtin slice (phase 6). This script is engine-only: the
// websocket and world-border features live in the skript-ts engine
// jar, so there is no .sk form of this file. The build emits only
// mundosk.ir.json and Skript-mode deployment skips it.
//
// Commands:
//   /wsconnect      connect the "echo" websocket (the behavior test
//                   runs a local echo server on port 8791)
//   /wsclose        disconnect it again
//   /border <size>  set the world border size of the player's world
//                   and report the size back
export const mundoskScript: Script = script(
  command("wsconnect", null, [wsConnect("echo", str("ws://127.0.0.1:8791"))]),
  onWsOpen([wsSend("echo", str("hello from skript-ts"))]),
  onWsMessage([broadcast(fmt("ws[", wsId(), "] ", wsMessage()))]),
  command("wsclose", null, [wsDisconnect("echo")]),
  onWsClose([broadcast(fmt("ws closed: ", wsId()))]),
  command("border", "integer", [
    setBorderSize(worldOf(player()), argument(1)),
    send(player(), fmt("border size is now ", borderSize(worldOf(player())))),
  ]),
);
