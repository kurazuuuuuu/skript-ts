import type { Script } from "../src/index.js";
import {
  script,
  command,
  defineFunction,
  param,
  localVar,
  localHandle,
  playerVar,
  variable,
  listVar,
  listSize,
  loopList,
  loopIndex,
  loopValue,
  call,
  returnValue,
  set,
  deleteVar,
  send,
  fmt,
  str,
  num,
  player,
  argument,
  cmdArg,
} from "../src/index.js";

// Multi-level variable indices (ext-varindex, feedback B6-3
// follow-up): variable(name, index1, index2, ...) emits
// {name::%index1%::%index2%}, and every segment goes through the
// usual index conversion — in particular a player segment keys
// by UUID in the engine. playerVar handles gain the same extra
// segments after the player, and localHandle / localVar support
// multi-level locals inside a function frame.
//
//   /skillset <text> <integer>  set {skillxp::%player%::%arg-1%} to arg-2
//   /skillread <text>           read it back through the handle
//   /skilladd <text> <integer>  add through the handle
//   /skilldel <text>            delete that one slot through the handle
//   /visetup                    {vindex::"a"::"b"}="AB", {vindex::"a"::"c"}="AC", {vindex::"d"}="D"
//   /viread <text> <text>       read one multi slot back (segments are case-insensitive)
//   /viread1 <text>             read one single-level slot back
//   /visize                     size of {vindex::*} is 1: {*} sees only DIRECT scalar
//                               children (probed) — the "a" node has children but no
//                               scalar of its own, so only the "d" entry appears
//   /vifn                       a function using a multi-level local handle

const skillXp = playerVar("skillxp");
const scratch = localHandle("vscratch");

export const varindexScript: Script = script(
  command(
    "skillset",
    [cmdArg("text"), cmdArg("integer")],
    [
      skillXp.set(player(), argument(1), argument(2)),
      send(player(), fmt("skillset=", skillXp.of(player(), argument(1)))),
    ],
  ),
  command(
    "skillread",
    [cmdArg("text")],
    [send(player(), fmt("skill=", skillXp.of(player(), argument(1))))],
  ),
  command(
    "skilladd",
    [cmdArg("text"), cmdArg("integer")],
    [
      skillXp.add(player(), argument(1), argument(2)),
      send(player(), fmt("skilladded=", skillXp.of(player(), argument(1)))),
    ],
  ),
  command(
    "skilldel",
    [cmdArg("text")],
    [
      skillXp.delete(player(), argument(1)),
      send(player(), fmt("skillafterdel=", skillXp.of(player(), argument(1)))),
    ],
  ),
  command("visetup", null, [
    set(variable("vindex", str("a"), str("b")), str("AB")),
    set(variable("vindex", str("a"), str("c")), str("AC")),
    set(variable("vindex", str("d")), str("D")),
    send(player(), str("visetup done")),
  ]),
  // NOTE: a multi-level variable with string-LITERAL segments does
  // not parse inside string interpolation under Skript 2.17.1
  // (%{vindex::%"a"%::%"b"%}% is a load error, pinned by verify);
  // expression segments (arguments / variables) parse fine there,
  // and literal segments are fine in value positions (visetup).
  command(
    "viread",
    [cmdArg("text"), cmdArg("text")],
    [send(player(), fmt("vi=", variable("vindex", argument(1), argument(2))))],
  ),
  command(
    "viread1",
    [cmdArg("text")],
    [send(player(), fmt("vi1=", variable("vindex", argument(1))))],
  ),
  command("visize", null, [
    send(player(), fmt("visize=", listSize(listVar("vindex")))),
    loopList(listVar("vindex"), [send(player(), fmt("vi entry ", loopIndex(), "=", loopValue()))]),
  ]),
  defineFunction("viFn", [param("k", "text")], "text", [
    scratch.set(localVar("k"), str("deep"), str("fnval")),
    returnValue(scratch.get(localVar("k"), str("deep"))),
  ]),
  command("vifn", null, [send(player(), fmt("vifn=", call("viFn", str("key1"))))]),
  command("videlone", null, [
    deleteVar(variable("vindex", str("a"), str("b"))),
    send(player(), str("videl done")),
  ]),
  command("viclear", null, [
    deleteVar(listVar("vindex")),
    send(player(), fmt("vicleared size=", listSize(listVar("vindex")))),
  ]),
);
