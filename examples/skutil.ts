import {
  argument,
  command,
  dirCreate,
  fileAppend,
  fileContents,
  fileCreate,
  fileDelete,
  fileExists,
  fileLine,
  fileLineCount,
  fileWrite,
  fmt,
  ifElse,
  player,
  script,
  send,
  str,
} from "../src/index.js";
import type { Script } from "../src/index.js";

// skUtilities builtin slice (phase 9). This script is engine-only:
// the text file core lives in the skript-ts engine jar, so there is
// no .sk form of this file. The build emits only skutil.ir.json and
// Skript-mode deployment skips it.
//
// Paths resolve under the engine's files root
// (plugins/skript-ts/files/). The demo keeps a visit log at
// logs/visits.txt, one line per /filelog call.
//
// Commands:
//   /filecreate       reset the demo: delete the log, create the
//                     directory and an empty log file, report state
//   /filelog <text>   append one line to the log, report the count
//   /fileread         send the whole log back as one message
//   /fileline <n>     send line n (1-based) of the log
//   /filecount        report the number of lines in the log
//   /filewipe         delete the log file, report the state after
//   /fileescape       try to write outside the files root and
//                     report that the escape was refused
const log = str("logs/visits.txt");
const dir = str("logs");

export const skutilScript: Script = script(
  command("filecreate", null, [
    fileDelete(log),
    dirCreate(dir),
    fileCreate(log),
    ifElse(
      fileExists(log),
      [send(player(), str("exists: true"))],
      [send(player(), str("exists: false"))],
    ),
  ]),
  command("filelog", "text", [
    fileAppend(log, fmt(argument(1))),
    send(player(), fmt("count ", fileLineCount(log))),
  ]),
  command("fileread", null, [send(player(), fmt("contents: ", fileContents(log)))]),
  command("fileline", "integer", [
    ifElse(
      fileExists(log),
      [send(player(), fmt("line ", argument(1), ": ", fileLine(log, argument(1))))],
      [send(player(), str("line: (none)"))],
    ),
  ]),
  command("filecount", null, [send(player(), fmt("lines: ", fileLineCount(log)))]),
  command("filewipe", null, [
    fileDelete(log),
    ifElse(
      fileExists(log),
      [send(player(), str("exists after wipe: true"))],
      [send(player(), str("exists after wipe: false"))],
    ),
  ]),
  command("fileescape", null, [
    fileWrite(str("../escape.txt"), str("pwned")),
    ifElse(
      fileExists(str("../escape.txt")),
      [send(player(), str("escape exists: true"))],
      [send(player(), str("escape exists: false"))],
    ),
  ]),
);
