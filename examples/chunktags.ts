import {
  blockAt,
  chunkTag,
  command,
  deleteChunkTag,
  fmt,
  hasChunkTag,
  ifElse,
  item,
  locationOf,
  num,
  player,
  script,
  send,
  setBlockAt,
  setChunkTag,
  str,
} from "../src/index.js";
import type { Script } from "../src/index.js";

// Chunk tags (ext-console U2). This script is ENGINE-ONLY: tags
// live in the chunk's PersistentDataContainer, which Skript
// cannot access, so there is no .sk form of this file. The
// build emits only chunktags.ir.json and Skript-mode
// deployment skips it.
//
// The rules mirror the hidden item tags: the engine namespaces
// every key with the plugin's own NamespacedKey, and the three
// tag types are text -> STRING, number -> DOUBLE, boolean ->
// BYTE (read back as a boolean). Unlike item tags, persistence
// is the world data's job: Bukkit saves a chunk's PDC with the
// chunk, so a record like "a block was placed here" survives
// restarts without growing variables.json. Access never
// force-loads a chunk — the target chunk must be loaded.
//
// Commands:
//   /chunkmark    place a stone block at the player and stamp
//                 its chunk with a text, a number and a
//                 boolean tag (targeted via the placed block)
//   /chunkcheck   read the tags back off the player's chunk
//                 (targeted via the player's location), branch
//                 on hasChunkTag, then delete the text tag and
//                 show that it reads as <none> afterwards
export const chunkTagsScript: Script = script(
  command("chunkmark", null, [
    setBlockAt(locationOf(player()), item("stone")),
    setChunkTag(blockAt(locationOf(player())), "placed", str("stone-marker")),
    setChunkTag(blockAt(locationOf(player())), "count", num(7)),
    setChunkTag(blockAt(locationOf(player())), "owned", true),
    send(player(), str("chunkmark: marked")),
  ]),
  command("chunkcheck", null, [
    send(
      player(),
      fmt(
        "chunkcheck: placed=",
        chunkTag(locationOf(player()), "placed"),
        " count=",
        chunkTag(locationOf(player()), "count"),
        " owned=",
        chunkTag(locationOf(player()), "owned"),
      ),
    ),
    ifElse(hasChunkTag(locationOf(player()), "placed"), [
      send(player(), str("chunkcheck: tagged=yes")),
    ]),
    deleteChunkTag(locationOf(player()), "placed"),
    ifElse(
      hasChunkTag(locationOf(player()), "placed"),
      [send(player(), str("chunkcheck: after-delete=tagged"))],
      [send(player(), str("chunkcheck: after-delete=untagged"))],
    ),
    send(player(), fmt("chunkcheck: missing=", chunkTag(locationOf(player()), "placed"))),
  ]),
);
