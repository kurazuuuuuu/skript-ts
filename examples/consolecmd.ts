import {
  argument,
  command,
  executeConsoleCommand,
  fmt,
  player,
  script,
  send,
  str,
} from "../src/index.js";
import type { Script } from "../src/index.js";

// Console command execution (ext-console U1). Core language: the
// same script runs under Skript (as emitted .sk) and under the
// engine. This is the subset's LAST-RESORT escape hatch: the
// command runs as the server console with full console
// permissions, its feedback goes to the console / log (not to
// the player who triggered it), and any string a player can
// influence becomes a console command — prefer a dedicated
// builder wherever one exists.
//
// Commands:
//   /consolesay      execute a fixed `say` command as console
//                    (no leading slash)
//   /consoleslash    the same with a leading slash, the form
//                    the original's own examples use ("/say ...")
//   /consoleecho <text>
//                    execute `say <text>` built from the
//                    argument, as console
export const consoleCmdScript: Script = script(
  command("consolesay", null, [
    executeConsoleCommand(str("say extconsole-fixed")),
    send(player(), str("consolesay: dispatched")),
  ]),
  command("consoleslash", null, [
    executeConsoleCommand(str("/say extconsole-slash")),
    send(player(), str("consoleslash: dispatched")),
  ]),
  command("consoleecho", "text", [
    executeConsoleCommand(fmt("say extconsole-echo ", argument(1))),
    send(player(), str("consoleecho: dispatched")),
  ]),
);
