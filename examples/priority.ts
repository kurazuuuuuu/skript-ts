import type { Script } from "../src/index.js";
import {
  broadcast,
  cancelEvent,
  equals,
  eventCancelled,
  fmt,
  ifElse,
  onDamage,
  script,
  str,
  victim,
} from "../src/index.js";

// Cancellation state and handler priority (B2, 2026-11-13):
// the safe-zone / XP pattern from real server work. A guard
// handler at an early priority cancels damage to GuardBot; the
// XP handler sits at a late priority, so under the probed
// dispatch contract — handlers run slot by slot from lowest to
// monitor, and once the event is cancelled no later handler
// runs at all — the XP handler simply never runs for a guarded
// hit. The handlers are declared OUT of priority order on
// purpose: the dispatch order must come from the priorities,
// not the file position. Two probed subtleties are pinned:
// the two explicit-"normal" handlers keep their declaration
// order inside the normal slot, and the UNDECLARED "legacy"
// handler dispatches in the HIGH slot (not the normal one),
// ahead of the explicit-high XP handler only because it is
// declared earlier. Entirely core constructs, so it runs
// under both runtimes; the behavior test drives it with
// console damage commands and asserts the exact broadcast
// sequence per victim.
export const priorityScript: Script = script(
  onDamage(
    [
      ifElse(
        eventCancelled(),
        [broadcast(fmt("[prio] monitor saw cancelled for ", victim()))],
        [broadcast(fmt("[prio] monitor ran for ", victim()))],
      ),
    ],
    { priority: "monitor" },
  ),
  // The legacy handler: no priority declared. Under the probed
  // contract it shares the high slot with the XP handler below
  // and runs first there (declared earlier).
  onDamage([broadcast(fmt("[prio] legacy ran for ", victim()))]),
  // The XP granter: reads the cancelled state and stops when
  // the hit was cancelled before its turn (with the skip rule
  // above, a guarded hit never reaches it at all — the check is
  // the belt-and-braces form the original's scripts use).
  onDamage(
    [
      ifElse(
        eventCancelled(),
        [broadcast(fmt("[prio] xp skipped for ", victim()))],
        [broadcast(fmt("[prio] xp granted for ", victim()))],
      ),
    ],
    { priority: "high" },
  ),
  onDamage([broadcast(fmt("[prio] normal-1 ran for ", victim()))], { priority: "normal" }),
  // The guard: cancels hits on GuardBot, then reads the state
  // back inside the same handler — the one place the cancelled
  // condition can read true on entry-free logic.
  onDamage(
    [
      ifElse(equals(fmt(victim()), str("GuardBot")), [
        broadcast(fmt("[prio] guard cancelled for ", victim())),
        cancelEvent(),
        ifElse(
          eventCancelled(),
          [broadcast(fmt("[prio] guard confirms cancelled for ", victim()))],
          [broadcast(fmt("[prio] guard FAILED to cancel for ", victim()))],
        ),
      ]),
    ],
    { priority: "low" },
  ),
  onDamage([broadcast(fmt("[prio] normal-2 ran for ", victim()))], { priority: "normal" }),
  onDamage([broadcast(fmt("[prio] highest ran for ", victim()))], { priority: "highest" }),
  onDamage(
    [
      ifElse(
        eventCancelled(),
        [broadcast(fmt("[prio] lowest saw cancelled for ", victim()))],
        [broadcast(fmt("[prio] lowest ran for ", victim()))],
      ),
    ],
    { priority: "lowest" },
  ),
);
