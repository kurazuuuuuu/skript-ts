import {
  broadcast,
  command,
  fmt,
  ifElse,
  num,
  onTimerComplete,
  onTimerTick,
  player,
  script,
  send,
  str,
  timerActive,
  timerCreate,
  timerId,
  timerPause,
  timerResume,
  timerStop,
  timerTimeLeft,
} from "../src/index.js";
import type { Script } from "../src/index.js";

// SharpSK builtin slice (phase 7). This script is engine-only: the
// named countdown timers live in the skript-ts engine jar, so there
// is no .sk form of this file. The build emits only sharpsk.ir.json
// and Skript-mode deployment skips it.
//
// Commands:
//   /timerstart   create the "demo" timer (3 seconds)
//   /timerpause   pause it (countdown freezes, timer stays active)
//   /timerresume  resume it
//   /timerstop    stop it (removed silently, no complete event)
//   /timerleft    report whether the timer is active and, if so,
//                 how many seconds are left
// The tick event fires every second while the timer runs; the
// complete event fires once when the countdown reaches zero.
export const sharpskScript: Script = script(
  command("timerstart", null, [
    timerCreate("demo", num(3)),
    send(player(), str("timer demo started")),
  ]),
  onTimerTick([broadcast(fmt("tick ", timerId(), " left ", timerTimeLeft(timerId())))]),
  onTimerComplete([broadcast(fmt("timer ", timerId(), " complete"))]),
  command("timerpause", null, [timerPause("demo"), send(player(), str("timer demo paused"))]),
  command("timerresume", null, [timerResume("demo"), send(player(), str("timer demo resumed"))]),
  command("timerstop", null, [timerStop("demo"), send(player(), str("timer demo stopped"))]),
  command("timerleft", null, [
    ifElse(
      timerActive(str("demo")),
      [send(player(), fmt("timer demo left ", timerTimeLeft(str("demo"))))],
      [send(player(), str("timer demo is not active"))],
    ),
  ]),
);
