import {
  clearSidebar,
  command,
  fmt,
  hasSidebar,
  ifElse,
  num,
  player,
  script,
  send,
  setSidebar,
  sidebarLine,
  sidebarLineCount,
  sidebarTitleOf,
  str,
} from "../src/index.js";
import type { Script } from "../src/index.js";

// Per-player sidebars (feedback D). This script is ENGINE-ONLY:
// Skript core has no sidebar / scoreboard-objective syntax (those
// forms belong to addons), so there is no .sk form of this file.
// The build emits only sidebar.ir.json and Skript-mode
// deployment skips it.
//
// Commands:
//   /sbset     set the player's sidebar: a colored title, three
//              lines (one of them a duplicate, one empty — both
//              must survive, the engine's entry names are
//              internal keys, not the line text)
//   /sbread    read the sidebar back: title, line count, each
//              line by its 1-based position, an out-of-range
//              line (reads as <none>), and the hasSidebar branch
//   /sbclear   clear the sidebar; a following /sbread reports
//              hasSidebar=false and every read-back as <none>
export const sidebarScript: Script = script(
  command("sbset", null, [
    setSidebar(
      player(),
      str("&6&lMy Server"),
      str("&7Welcome!"),
      str(""),
      str("&7Welcome!"),
      fmt("&aOnline: ", num(3)),
    ),
    send(player(), str("sbset: done")),
  ]),
  command("sbread", null, [
    ifElse(
      hasSidebar(player()),
      [send(player(), str("sbread: has=yes"))],
      [send(player(), str("sbread: has=no"))],
    ),
    send(
      player(),
      fmt("sbread: title=", sidebarTitleOf(player()), " count=", sidebarLineCount(player())),
    ),
    send(
      player(),
      fmt(
        "sbread: lines=",
        sidebarLine(player(), num(1)),
        "|",
        sidebarLine(player(), num(2)),
        "|",
        sidebarLine(player(), num(3)),
        "|",
        sidebarLine(player(), num(4)),
      ),
    ),
    send(player(), fmt("sbread: line9=", sidebarLine(player(), num(9)))),
  ]),
  command("sbclear", null, [clearSidebar(player()), send(player(), str("sbclear: done"))]),
);
