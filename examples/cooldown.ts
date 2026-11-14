import type { Script } from "../src/index.js";
import { broadcast, command, fmt, player, script, str } from "../src/index.js";

// Command cooldown + executable-by (feedback C6): the
// `cooldown`, `cooldown message`, `cooldown bypass` and
// `executable by` section entries. Core language: under Skript
// the emitted sections are enforced by the original; under the
// engine jar the same IR fields are enforced by the engine
// itself, with identical observable behavior for the cases the
// behavior test drives.
//
//   /ccool    players only, 3-second per-player cooldown. A
//             run inside the cooldown does not run the body
//             and answers with the cooldown message instead.
//             Holders of skriptts.test.cooldown.bypass skip
//             the cooldown. The message deliberately carries
//             no %remaining time% placeholder: the engine
//             sends it without placeholder substitution in
//             this version (see docs/reference.md), so a
//             placeholder-free text reads identically under
//             both runtimes.
//   /cponly   players only (no cooldown): the console cannot
//             run it — its broadcast must never appear for a
//             console invocation.
//   /cconly   console only: players cannot run it.
//   /cboth    executable by both: anyone may run it.
export const cooldownScript: Script = script(
  command("ccool", [], [broadcast(fmt("ccool ran by ", player()))], {
    cooldown: 3,
    cooldownMessage: "ccool is on cooldown, please wait",
    cooldownBypass: "skriptts.test.cooldown.bypass",
    executableBy: "players",
  }),
  command("cponly", [], [broadcast(str("cponly ran"))], {
    executableBy: "players",
  }),
  command("cconly", [], [broadcast(str("cconly ran"))], {
    executableBy: "console",
  }),
  command("cboth", [], [broadcast(str("cboth ran"))], {
    executableBy: "both",
  }),
);
