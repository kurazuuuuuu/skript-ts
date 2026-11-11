import type { Script } from "../src/index.js";
import {
  argument,
  broadcast,
  cmdArg,
  command,
  fmt,
  player,
  script,
  send,
  str,
} from "../src/index.js";

// Command definitions (phase 20): any number of typed arguments
// plus the permission / usage / aliases section entries. Argument
// parsing follows the original's Brigadier behavior in both
// runtimes: a bad value, an offline player name, a missing
// required argument or a leftover token fails the invocation with
// Brigadier's message and the trigger never runs.
//
//   /cpoke CmdB 3     "cpoke target=CmdB n=3", and CmdB is told
//                     who poked them; the count is optional
//   /croll 1.5 true   a number and a boolean argument
//   /citem diamond_sword
//                     an item argument (single-token item id)
//   /ctell CmdB hello there
//                     a trailing text argument takes the rest of
//                     the line
//   /cmix hello       an optional integer before a required text:
//                     "hello" reads as the text (backtracking)
//   /coff Ghost       an offline player argument: any name works
//   /cadmin           permission-gated; senders without
//                     skriptts.test.admin cannot address it
//   /cuse             with no argument, the usage line answers
//   /calias, /ca2, /ca3
//                     one command under three names
export const commandsScript: Script = script(
  command(
    "cpoke",
    [cmdArg("player"), cmdArg("integer", true)],
    [
      broadcast(fmt("cpoke target=", argument(1), " n=", argument(2))),
      send(argument(1), fmt("cpoke: poked by ", player())),
    ],
  ),
  command(
    "croll",
    [cmdArg("number"), cmdArg("boolean")],
    [broadcast(fmt("croll num=", argument(1), " bool=", argument(2)))],
  ),
  command("citem", [cmdArg("item")], [broadcast(fmt("citem item=", argument(1)))]),
  command(
    "ctell",
    [cmdArg("player"), cmdArg("text")],
    [broadcast(fmt("ctell to=", argument(1), " text=", argument(2)))],
  ),
  command(
    "cmix",
    [cmdArg("integer", true), cmdArg("text")],
    [broadcast(fmt("cmix n=", argument(1), " text=", argument(2)))],
  ),
  command("coff", [cmdArg("offlinePlayer")], [broadcast(fmt("coff p=", argument(1)))]),
  command("cadmin", [], [broadcast(fmt("cadmin ran by ", player()))], {
    permission: "skriptts.test.admin",
  }),
  command("cuse", [cmdArg("integer")], [broadcast(fmt("cuse n=", argument(1)))], {
    usage: "USAGE /cuse <count>",
  }),
  command("calias", [], [broadcast(str("calias ran"))], {
    aliases: ["/ca2", "ca3"],
  }),
);
