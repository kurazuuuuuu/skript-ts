import {
  add,
  and,
  broadcast,
  call,
  command,
  dateFromUnix,
  defineFunction,
  differenceBetween,
  equals,
  fmt,
  greaterThan,
  ifElse,
  lessThan,
  listAdd,
  localList,
  localVar,
  loopList,
  minus,
  now,
  num,
  param,
  player,
  plus,
  returnValue,
  script,
  send,
  set,
  str,
  timespan,
  unixTimestamp,
  variable,
  wait,
} from "../src/index.js";
import type { Script } from "../src/index.js";

// Core-language sample (feedback C3): dates — the current
// time, unix timestamps, differences between times, and date
// shifting with timespans. Entirely core constructs, so it
// runs under both runtimes — the emitted .sk under Skript and
// the IR under the engine jar. Every battery line computes
// into a local first and interpolates the local (the codebase
// pattern for expression shapes whose interpolation grammar
// is unverified).
//
//   /timenow   prints the current date and its unix timestamp
//   /timecalc  the value battery: deterministic lines of the
//              form "TIME <label>=[<value>]" or "=<bool>"
//   /cdstart   starts a 5-second cooldown for the caller
//   /cdleft    reports the caller's cooldown state — the
//              remaining time is a difference of two dates
export const timeScript: Script = script(
  defineFunction("timeUnixOf", [param("d", "date")], "number", [
    returnValue(unixTimestamp(localVar("d"))),
  ]),
  defineFunction("timeNowFn", [], "date", [returnValue(now())]),
  defineFunction("timeCount", [param("ds", "dates")], "number", [
    set(localVar("n"), num(0)),
    loopList(localList("ds"), [add(localVar("n"), num(1))]),
    returnValue(localVar("n")),
  ]),
  command("timenow", null, [
    set(localVar("n"), now()),
    set(localVar("u"), unixTimestamp(localVar("n"))),
    broadcast(fmt("TIME now=[", localVar("n"), "]")),
    broadcast(fmt("TIME unix=[", localVar("u"), "]")),
  ]),
  command("timecalc", null, [
    // round trip: now -> unix -> date -> unix stays within a
    // centisecond (both conversions are millisecond-based)
    set(localVar("u"), unixTimestamp(now())),
    set(localVar("d"), dateFromUnix(localVar("u"))),
    set(localVar("u2"), unixTimestamp(localVar("d"))),
    set(localVar("delta"), minus(localVar("u2"), localVar("u"))),
    ifElse(
      and(greaterThan(localVar("delta"), num(-0.01)), lessThan(localVar("delta"), num(0.01))),
      [broadcast(str("TIME roundtrip=true"))],
      [broadcast(str("TIME roundtrip=false"))],
    ),
    // a fixed date prints in the default format and its unix
    // timestamp reads back exactly
    set(localVar("fd"), dateFromUnix(num(1700000000))),
    broadcast(fmt("TIME fixed=[", localVar("fd"), "]")),
    set(localVar("fu"), unixTimestamp(localVar("fd"))),
    broadcast(fmt("TIME fixedunix=[", localVar("fu"), "]")),
    // the difference of a date with itself is zero
    set(localVar("n"), now()),
    set(localVar("self"), differenceBetween(localVar("n"), localVar("n"))),
    broadcast(fmt("TIME diffself=[", localVar("self"), "]")),
    // numeric and timespan differences are absolute too
    set(localVar("nd"), differenceBetween(num(10), num(3))),
    broadcast(fmt("TIME numdiff=[", localVar("nd"), "]")),
    set(localVar("td"), differenceBetween(timespan(90, "seconds"), timespan(30, "seconds"))),
    broadcast(fmt("TIME tsdiff=[", localVar("td"), "]")),
    // a measured difference over a 2-second wait, both ways
    set(localVar("a"), now()),
    wait(num(2), "seconds"),
    set(localVar("b"), now()),
    set(localVar("fwd"), differenceBetween(localVar("b"), localVar("a"))),
    set(localVar("rev"), differenceBetween(localVar("a"), localVar("b"))),
    ifElse(
      equals(localVar("fwd"), localVar("rev")),
      [broadcast(str("TIME diffabs=true"))],
      [broadcast(str("TIME diffabs=false"))],
    ),
    ifElse(
      and(
        greaterThan(localVar("fwd"), timespan(1, "seconds")),
        lessThan(localVar("fwd"), timespan(4, "seconds")),
      ),
      [broadcast(str("TIME diffwindow=true"))],
      [broadcast(str("TIME diffwindow=false"))],
    ),
    // date shifting: + a timespan moves later, - moves earlier
    set(localVar("base"), now()),
    set(localVar("deadline"), plus(localVar("base"), timespan(90, "seconds"))),
    set(localVar("gap"), differenceBetween(localVar("deadline"), localVar("base"))),
    ifElse(
      and(
        greaterThan(localVar("gap"), timespan(80, "seconds")),
        lessThan(localVar("gap"), timespan(100, "seconds")),
      ),
      [broadcast(str("TIME dateplus=true"))],
      [broadcast(str("TIME dateplus=false"))],
    ),
    set(localVar("earlier"), minus(localVar("base"), timespan(5, "seconds"))),
    set(localVar("gap2"), differenceBetween(localVar("base"), localVar("earlier"))),
    ifElse(
      and(
        greaterThan(localVar("gap2"), timespan(3, "seconds")),
        lessThan(localVar("gap2"), timespan(7, "seconds")),
      ),
      [broadcast(str("TIME dateminus=true"))],
      [broadcast(str("TIME dateminus=false"))],
    ),
    // the asymmetric pairings have no value: a timespan plus a
    // date, and a date minus a date
    set(localVar("tp"), plus(timespan(5, "seconds"), localVar("base"))),
    broadcast(fmt("TIME tsplus=[", localVar("tp"), "]")),
    set(localVar("dd"), minus(localVar("b"), localVar("a"))),
    broadcast(fmt("TIME datediff=[", localVar("dd"), "]")),
    // functions: a date parameter, a date return, plural dates
    set(localVar("fu2"), call("timeUnixOf", now())),
    set(localVar("du"), unixTimestamp(now())),
    ifElse(
      and(
        greaterThan(localVar("fu2"), minus(localVar("du"), num(2))),
        lessThan(localVar("fu2"), plus(localVar("du"), num(2))),
      ),
      [broadcast(str("TIME fn=true"))],
      [broadcast(str("TIME fn=false"))],
    ),
    set(localVar("fn"), call("timeNowFn")),
    set(localVar("fdiff"), differenceBetween(localVar("fn"), localVar("base"))),
    ifElse(
      lessThan(localVar("fdiff"), timespan(30, "seconds")),
      [broadcast(str("TIME fnnow=true"))],
      [broadcast(str("TIME fnnow=false"))],
    ),
    listAdd(localList("ds"), now()),
    listAdd(localList("ds"), localVar("a")),
    set(localVar("cnt"), call("timeCount", localList("ds"))),
    broadcast(fmt("TIME fncount=[", localVar("cnt"), "]")),
  ]),
  command("cdstart", null, [
    set(variable("cduntil", player()), plus(now(), timespan(5, "seconds"))),
    send(player(), str("TIME cd started")),
  ]),
  command("cdleft", null, [
    set(localVar("until"), variable("cduntil", player())),
    ifElse(
      equals(localVar("until"), localVar("until")),
      [
        set(localVar("n"), now()),
        ifElse(
          greaterThan(localVar("n"), localVar("until")),
          [send(player(), str("TIME cd state=ready"))],
          [
            set(localVar("left"), differenceBetween(localVar("until"), localVar("n"))),
            send(player(), fmt("TIME cd state=cooling left=[", localVar("left"), "]")),
          ],
        ),
      ],
      [send(player(), str("TIME cd state=none"))],
    ),
  ]),
);
