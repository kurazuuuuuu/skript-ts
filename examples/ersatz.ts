import {
  argument,
  command,
  equals,
  fmt,
  ifElse,
  onPlaceholderRequest,
  placeholderIdentifier,
  placeholderPrefix,
  placeholderValue,
  player,
  script,
  send,
  setPlaceholderResult,
  str,
} from "../src/index.js";
import type { Script } from "../src/index.js";

// Ersatz builtin slice (phase 10). This script is engine-only: the
// PlaceholderAPI bridge lives in the skript-ts engine jar, so there
// is no .sk form of this file. The build emits only ersatz.ir.json
// and Skript-mode deployment skips it. PlaceholderAPI itself stays
// an external plugin — the engine soft-depends on it, and the
// verify harness deploys it next to the engine in the sandbox.
//
// The script serves two placeholder prefixes of its own and reads
// values back through a command:
//   %skriptts_name%           -> the target player's name (the
//                                handler branches on the identifier
//                                with the core text-equality
//                                condition added in phase 11)
//   %skriptts_<anything else>% -> "echo-<anything>"
//   %skripttswho_<anything>%  -> "skripttswho for <player name>"
//   /papiget <text>           -> evaluates the text as placeholders
//                                for the command sender: a bare name
//                                ("skriptts_greet") is one
//                                placeholder, a text with %...%
//                                tokens is formatted as a whole, and
//                                unresolvable placeholders stay
//                                literal ("%nope_missing%").
export const ersatzScript: Script = script(
  onPlaceholderRequest("skriptts", [
    ifElse(
      equals(placeholderIdentifier(), str("name")),
      [setPlaceholderResult(fmt(player()))],
      [setPlaceholderResult(fmt("echo-", placeholderIdentifier()))],
    ),
  ]),
  onPlaceholderRequest("skripttswho", [
    setPlaceholderResult(fmt(placeholderPrefix(), " for ", player())),
  ]),
  command("papiget", "text", [
    send(player(), fmt("papi value: ", placeholderValue(player(), fmt(argument(1))))),
  ]),
);
