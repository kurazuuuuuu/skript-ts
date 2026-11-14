// Font-char UI rendering (RP-4).
//
// A pack font char is just a character once resolved, so UI text
// is built by composing fontCharOf() into the ordinary text
// positions: fmt() message parts, GUI titles, item names. The
// project build resolves each reference against the pack in
// examples/resourcepack.ts — the coin glyph auto-allocates
// U+E000 and the gem icon U+E001 (see fontchar-registry.json) —
// and replaces the node with a string literal, so this script
// is plain core language by the time it is emitted.
//
//   /fontui     send a message carrying the coin glyph (the
//               FontCharDef handle form) and open a 3-row chest
//               GUI whose title carries the gem icon glyph
//               (the string id form)

import { command, fmt, fontCharOf, num, openGui, player, script, send } from "../src/index.js";
import type { Script } from "../src/index.js";
import { coinChar } from "./resourcepack.js";

export const fontUiScript: Script = script(
  command("fontui", null, [
    send(player(), fmt("コイン: ", fontCharOf(coinChar))),
    openGui(player(), num(3), fmt("ジェム: ", fontCharOf("ui/gem_icon"))),
  ]),
);
