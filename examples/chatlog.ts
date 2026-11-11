import {
  script,
  onChat,
  loopPlayers,
  ifElse,
  isOp,
  loopPlayer,
  send,
  fmt,
  player,
  chatMessage,
} from "../src/index.js";
import type { Script } from "../src/index.js";

export const chatLogScript: Script = script(
  onChat([
    loopPlayers([
      ifElse(isOp(loopPlayer()), [
        send(loopPlayer(), fmt("[LOG] ", player(), ": ", chatMessage())),
      ]),
    ]),
  ]),
);
