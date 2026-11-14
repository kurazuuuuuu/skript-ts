import {
  broadcast,
  command,
  giveItem,
  item,
  loopTimes,
  num,
  onPickup,
  player,
  script,
  send,
  str,
  withAmount,
} from "../src/index.js";
import type { Script } from "../src/index.js";

// giveItem overflow (feedback B5): what happens when the
// target inventory has no room for the given item. The
// intended semantics — for BOTH runtimes — is that the
// un-fitted remainder drops naturally at the player's feet
// instead of vanishing, so it can be picked back up once
// space exists. (Verified 2026-11-14: the real Skript's
// give effect drops overflow the same way; the behavior
// suite pins the shared DROP behavior in both modes.)
//
// /fillbags fills every storage slot with a full stack of
// dirt through giveItem itself, so the same give path is
// exercised on the way in. /giveprize then tries to hand
// over one diamond sword: with no free slot it cannot fit,
// so it must land on the ground. The filtered pickup
// handler broadcasts the marker the behavior test waits
// for once the sword is collected after a clear.
export const giveoverflowScript: Script = script(
  command("fillbags", null, [
    // 36 storage slots x a full stack of 64 dirt each.
    loopTimes(num(36), [giveItem(player(), withAmount(item("dirt"), num(64)))]),
    send(player(), str("fillbags: done")),
  ]),
  command("giveprize", null, [
    giveItem(player(), item("diamond sword")),
    send(player(), str("giveprize: done")),
  ]),
  onPickup([broadcast(str("picked prize"))], { item: "diamond sword" }),
);
