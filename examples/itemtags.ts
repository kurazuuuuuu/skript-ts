import {
  command,
  fmt,
  giveItem,
  hasItemTag,
  ifElse,
  item,
  itemTag,
  localVar,
  num,
  player,
  script,
  send,
  set,
  setItemTag,
  str,
  variable,
} from "../src/index.js";
import type { Script } from "../src/index.js";

// Hidden item tags (feedback D). This script is ENGINE-ONLY:
// tags live in the item's PersistentDataContainer, which Skript
// cannot access, so there is no .sk form of this file. The build
// emits only itemtags.ir.json and Skript-mode deployment skips it.
//
// A name or lore line can be faked by a modified client; a PDC
// tag cannot — the engine namespaces every key with the plugin's
// own NamespacedKey, and only scripts can write it. The three
// tag types are exercised here: text -> STRING, number ->
// DOUBLE, boolean -> BYTE (read back as a boolean).
//
// Commands:
//   /tagitem    build a diamond sword, stamp it with the three
//               tags, keep the tagged stack in {taggeditem} (the
//               global variable store persists the tags with the
//               stack) and hand a copy to the player
//   /tagcheck   read the tags back off {taggeditem}, branch on
//               hasItemTag for the stored stack, and do the same
//               branch for a fresh untagged sword — whose missing
//               tag reads as <none>
export const itemTagsScript: Script = script(
  command("tagitem", null, [
    set(localVar("i"), item("diamond sword")),
    setItemTag(localVar("i"), "serial", str("gem-001")),
    setItemTag(localVar("i"), "tier", num(3)),
    setItemTag(localVar("i"), "genuine", true),
    set(variable("taggeditem"), localVar("i")),
    giveItem(player(), localVar("i")),
    send(player(), str("tagitem: given")),
  ]),
  command("tagcheck", null, [
    send(
      player(),
      fmt(
        "tagcheck: serial=",
        itemTag(variable("taggeditem"), "serial"),
        " tier=",
        itemTag(variable("taggeditem"), "tier"),
        " genuine=",
        itemTag(variable("taggeditem"), "genuine"),
      ),
    ),
    ifElse(hasItemTag(variable("taggeditem"), "serial"), [
      send(player(), str("tagcheck: tagged=yes")),
    ]),
    set(localVar("plain"), item("diamond sword")),
    ifElse(
      hasItemTag(localVar("plain"), "serial"),
      [send(player(), str("tagcheck: plain=tagged"))],
      [send(player(), str("tagcheck: plain=untagged"))],
    ),
    send(player(), fmt("tagcheck: missing=", itemTag(localVar("plain"), "serial"))),
  ]),
);
