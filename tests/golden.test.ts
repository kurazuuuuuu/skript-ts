import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  add,
  and,
  argument,
  bool,
  broadcast,
  chatMessage,
  command,
  deleteVar,
  dividedBy,
  emit,
  equals,
  eventPlayer,
  fmt,
  give,
  greaterOrEqual,
  greaterThan,
  hasPermission,
  ifElse,
  isOp,
  item,
  lessOrEqual,
  lessThan,
  listAdd,
  listRemove,
  listSize,
  listVar,
  locationOf,
  loopIndex,
  loopList,
  loopPlayer,
  loopPlayers,
  loopRange,
  loopTimes,
  loopValue,
  minus,
  not,
  notEquals,
  num,
  onChat,
  onDeath,
  onFirstJoin,
  onJoin,
  onQuit,
  or,
  player,
  plus,
  remainder,
  script,
  send,
  set,
  str,
  teleport,
  times,
  variable,
  victim,
  wait,
  whileLoop,
} from "../src/index.js";
import { welcomeScript } from "../examples/welcome.js";
import { kitScript } from "../examples/kit.js";
import { chatLogScript } from "../examples/chatlog.js";
import { deathScript } from "../examples/death.js";
import { spawnScript } from "../examples/spawn.js";
import { logicScript } from "../examples/logic.js";
import { listsScript } from "../examples/lists.js";

function fixture(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)),
    "utf8",
  );
}

describe("whole sample programs (golden fixtures)", () => {
  it("welcome", () => {
    expect(emit(welcomeScript)).toBe(fixture("welcome.sk"));
  });
  it("kit", () => {
    expect(emit(kitScript)).toBe(fixture("kit.sk"));
  });
  it("chatlog", () => {
    expect(emit(chatLogScript)).toBe(fixture("chatlog.sk"));
  });
  it("death", () => {
    expect(emit(deathScript)).toBe(fixture("death.sk"));
  });
  it("spawn", () => {
    expect(emit(spawnScript)).toBe(fixture("spawn.sk"));
  });
  it("logic", () => {
    expect(emit(logicScript)).toBe(fixture("logic.sk"));
  });
  it("lists", () => {
    expect(emit(listsScript)).toBe(fixture("lists.sk"));
  });
});

describe("event headers", () => {
  const body = [broadcast(str("x"))];
  it("join", () => {
    expect(emit(script(onJoin(body)))).toBe('on join:\n    broadcast "x"\n');
  });
  it("first join", () => {
    expect(emit(script(onFirstJoin(body)))).toBe(
      'on first join:\n    broadcast "x"\n',
    );
  });
  it("quit", () => {
    expect(emit(script(onQuit(body)))).toBe('on quit:\n    broadcast "x"\n');
  });
  it("chat", () => {
    expect(emit(script(onChat(body)))).toBe('on chat:\n    broadcast "x"\n');
  });
  it("death", () => {
    expect(emit(script(onDeath(body)))).toBe('on death:\n    broadcast "x"\n');
  });
});

describe("commands", () => {
  it("no argument", () => {
    expect(emit(script(command("home", null, [broadcast(str("x"))])))).toBe(
      'command /home:\n    trigger:\n        broadcast "x"\n',
    );
  });
  it("optional text argument uses [<text>]", () => {
    expect(emit(script(command("msg", "text", [broadcast(str("x"))])))).toBe(
      'command /msg [<text>]:\n    trigger:\n        broadcast "x"\n',
    );
  });
  it("required player argument uses <player>", () => {
    expect(
      emit(script(command("tp", "player", [broadcast(str("x"))], false))),
    ).toBe('command /tp <player>:\n    trigger:\n        broadcast "x"\n');
  });
  it("integer argument", () => {
    expect(emit(script(command("give2", "integer", [broadcast(str("x"))])))).toBe(
      'command /give2 [<integer>]:\n    trigger:\n        broadcast "x"\n',
    );
  });
});

describe("effects", () => {
  it("send with plain string", () => {
    expect(emit(script(onJoin([send(player(), str("hi"))])))).toBe(
      'on join:\n    send "hi" to player\n',
    );
  });
  it("give with amount and item name", () => {
    expect(emit(script(onJoin([give(player(), "diamond sword", 2)])))).toBe(
      "on join:\n    give 2 diamond sword to player\n",
    );
  });
  it("teleport to a location expression", () => {
    expect(
      emit(script(onJoin([teleport(player(), locationOf(eventPlayer()))]))),
    ).toBe("on join:\n    teleport player to location of event-player\n");
  });
  it("set variable to string / number / boolean / item", () => {
    expect(emit(script(onJoin([set(variable("a"), str("v"))])))).toBe(
      'on join:\n    set {a} to "v"\n',
    );
    expect(emit(script(onJoin([set(variable("a"), num(42))])))).toBe(
      "on join:\n    set {a} to 42\n",
    );
    expect(emit(script(onJoin([set(variable("a"), bool(false))])))).toBe(
      "on join:\n    set {a} to false\n",
    );
    expect(emit(script(onJoin([set(variable("a"), item("stone"))])))).toBe(
      "on join:\n    set {a} to stone\n",
    );
  });
  it("add to an indexed variable", () => {
    expect(
      emit(script(onJoin([add(variable("coins", player()), num(5))]))),
    ).toBe("on join:\n    add 5 to {coins::%player%}\n");
  });
});

describe("conditions and control flow", () => {
  it("if with hasPermission, no else", () => {
    expect(
      emit(
        script(
          onJoin([
            ifElse(hasPermission(player(), "a.b"), [broadcast(str("y"))]),
          ]),
        ),
      ),
    ).toBe(
      'on join:\n    if player has permission "a.b":\n        broadcast "y"\n',
    );
  });
  it("if/else with isOp", () => {
    expect(
      emit(
        script(
          onJoin([
            ifElse(
              isOp(player()),
              [broadcast(str("op"))],
              [broadcast(str("not op"))],
            ),
          ]),
        ),
      ),
    ).toBe(
      'on join:\n    if player is op:\n        broadcast "op"\n    else:\n        broadcast "not op"\n',
    );
  });
  it("loop all players exposes loop-player", () => {
    expect(
      emit(script(onJoin([loopPlayers([send(loopPlayer(), str("hi"))])]))),
    ).toBe('on join:\n    loop all players:\n        send "hi" to loop-player\n');
  });
});

describe("expressions inside format strings", () => {
  it("all expression kinds embed correctly", () => {
    const msg = fmt(
      "p=",
      player(),
      " e=",
      eventPlayer(),
      " l=",
      loopPlayer(),
      " a=",
      argument(2),
      " m=",
      chatMessage(),
      " v=",
      variable("score", player()),
      " n=",
      num(7),
      " b=",
      bool(true),
      " i=",
      item("apple"),
      " loc=",
      locationOf(player()),
    );
    expect(emit(script(onJoin([broadcast(msg)])))).toBe(
      'on join:\n    broadcast "p=%player% e=%event-player% l=%loop-player% a=%arg-2% m=%message% v=%{score::%player%}% n=7 b=true i=apple loc=%location of player%"\n',
    );
  });
  it("nested format flattens into the enclosing string", () => {
    const msg = fmt("outer ", fmt("inner ", player()));
    expect(emit(script(onJoin([broadcast(msg)])))).toBe(
      'on join:\n    broadcast "outer inner %player%"\n',
    );
  });
  it("format in value position becomes a quoted string", () => {
    expect(
      emit(script(onJoin([set(variable("a"), fmt("x ", player()))]))),
    ).toBe('on join:\n    set {a} to "x %player%"\n');
  });
});

describe("string escaping", () => {
  it("quotes are doubled and percent is doubled in literals", () => {
    expect(emit(script(onJoin([broadcast(str('100% "done"'))])))).toBe(
      'on join:\n    broadcast "100%% ""done"""\n',
    );
  });
  it("escaping applies to format literal parts but not to expression placeholders", () => {
    expect(
      emit(script(onJoin([broadcast(fmt("50% off, ", player(), "!"))]))),
    ).toBe('on join:\n    broadcast "50%% off, %player%!"\n');
  });
  it("escaping applies to permission strings", () => {
    expect(
      emit(
        script(
          onJoin([ifElse(hasPermission(player(), 'we"ird'), [broadcast(str("y"))])]),
        ),
      ),
    ).toBe(
      'on join:\n    if player has permission "we""ird":\n        broadcast "y"\n',
    );
  });
});

describe("victim expression (death events have no player)", () => {
  it("emits victim in value and string positions", () => {
    expect(
      emit(
        script(
          onDeath([
            add(variable("deaths", victim()), num(1)),
            send(victim(), fmt("total: ", variable("deaths", victim()))),
          ]),
        ),
      ),
    ).toBe(
      'on death:\n    add 1 to {deaths::%victim%}\n    send "total: %{deaths::%victim%}%" to victim\n',
    );
  });
});

describe("comparisons (phase 11)", () => {
  const wrap = (cond: Parameters<typeof ifElse>[0], elseBody?: Parameters<typeof ifElse>[2]) =>
    emit(script(onJoin([ifElse(cond, [broadcast(str("y"))], elseBody)])));
  it("equals / notEquals over text and numbers", () => {
    expect(wrap(equals(chatMessage(), str("ping")))).toBe(
      'on join:\n    if message is "ping":\n        broadcast "y"\n',
    );
    expect(wrap(notEquals(variable("count"), num(0)))).toBe(
      "on join:\n    if {count} is not 0:\n        broadcast \"y\"\n",
    );
  });
  it("ordering comparisons", () => {
    expect(wrap(greaterThan(variable("count"), num(5)))).toBe(
      "on join:\n    if {count} is greater than 5:\n        broadcast \"y\"\n",
    );
    expect(wrap(greaterOrEqual(argument(1), num(100)))).toBe(
      "on join:\n    if arg-1 is greater than or equal to 100:\n        broadcast \"y\"\n",
    );
    expect(wrap(lessThan(variable("count"), num(5)))).toBe(
      "on join:\n    if {count} is less than 5:\n        broadcast \"y\"\n",
    );
    expect(wrap(lessOrEqual(variable("count"), num(5)))).toBe(
      "on join:\n    if {count} is less than or equal to 5:\n        broadcast \"y\"\n",
    );
  });
  it("an arithmetic operand is parenthesized", () => {
    expect(wrap(equals(plus(variable("count"), num(1)), num(5)))).toBe(
      "on join:\n    if ({count} + 1) is 5:\n        broadcast \"y\"\n",
    );
  });
});

describe("logic conditions lower to control flow (phase 11)", () => {
  const y = [broadcast(str("y"))];
  const n = [broadcast(str("n"))];
  it("and without else nests the second check", () => {
    expect(
      emit(script(onJoin([ifElse(and(isOp(player()), hasPermission(player(), "a.b")), y)]))),
    ).toBe(
      'on join:\n    if player is op:\n        if player has permission "a.b":\n            broadcast "y"\n',
    );
  });
  it("and with else duplicates the else branch", () => {
    expect(
      emit(script(onJoin([ifElse(and(equals(variable("a"), num(1)), equals(variable("b"), num(2))), y, n)]))),
    ).toBe(
      'on join:\n    if {a} is 1:\n        if {b} is 2:\n            broadcast "y"\n        else:\n            broadcast "n"\n    else:\n        broadcast "n"\n',
    );
  });
  it("or with else nests the second check in the else branch", () => {
    expect(
      emit(script(onJoin([ifElse(or(equals(variable("a"), num(1)), equals(variable("b"), num(2))), y, n)]))),
    ).toBe(
      'on join:\n    if {a} is 1:\n        broadcast "y"\n    else:\n        if {b} is 2:\n            broadcast "y"\n        else:\n            broadcast "n"\n',
    );
  });
  it("not over a leaf uses the native negated form when there is no else", () => {
    expect(emit(script(onJoin([ifElse(not(isOp(player())), y)])))).toBe(
      'on join:\n    if player is not op:\n        broadcast "y"\n',
    );
    expect(emit(script(onJoin([ifElse(not(greaterThan(variable("a"), num(5))), y)])))).toBe(
      "on join:\n    if {a} is not greater than 5:\n        broadcast \"y\"\n",
    );
    expect(emit(script(onJoin([ifElse(not(hasPermission(player(), "a.b")), y)])))).toBe(
      'on join:\n    if player does not have permission "a.b":\n        broadcast "y"\n',
    );
  });
  it("not with an else swaps the branches", () => {
    expect(emit(script(onJoin([ifElse(not(isOp(player())), y, n)])))).toBe(
      'on join:\n    if player is op:\n        broadcast "n"\n    else:\n        broadcast "y"\n',
    );
  });
  it("not over and applies De Morgan", () => {
    expect(
      emit(script(onJoin([ifElse(not(and(isOp(player()), equals(variable("a"), num(1)))), y)]))),
    ).toBe(
      'on join:\n    if player is op:\n        if {a} is not 1:\n            broadcast "y"\n    else:\n        broadcast "y"\n',
    );
  });
  it("double negation collapses", () => {
    expect(emit(script(onJoin([ifElse(not(not(isOp(player()))), y)])))).toBe(
      'on join:\n    if player is op:\n        broadcast "y"\n',
    );
  });
  it("three-way and folds into nested checks", () => {
    expect(
      emit(
        script(
          onJoin([
            ifElse(
              and(equals(variable("a"), num(1)), equals(variable("b"), num(2)), equals(variable("c"), num(3))),
              y,
            ),
          ]),
        ),
      ),
    ).toBe(
      'on join:\n    if {a} is 1:\n        if {b} is 2:\n            if {c} is 3:\n                broadcast "y"\n',
    );
  });
});

describe("arithmetic expressions (phase 11)", () => {
  it("four operations and remainder in value position", () => {
    expect(emit(script(onJoin([set(variable("a"), plus(num(1), num(2)))])))).toBe(
      "on join:\n    set {a} to (1 + 2)\n",
    );
    expect(emit(script(onJoin([set(variable("a"), minus(num(5), num(3)))])))).toBe(
      "on join:\n    set {a} to (5 - 3)\n",
    );
    expect(emit(script(onJoin([set(variable("a"), times(num(3), num(4)))])))).toBe(
      "on join:\n    set {a} to (3 * 4)\n",
    );
    expect(emit(script(onJoin([set(variable("a"), dividedBy(num(7), num(2)))])))).toBe(
      "on join:\n    set {a} to (7 / 2)\n",
    );
    expect(emit(script(onJoin([set(variable("a"), remainder(num(7), num(3)))])))).toBe(
      "on join:\n    set {a} to mod(7, 3)\n",
    );
  });
  it("nesting parenthesizes every level", () => {
    expect(
      emit(script(onJoin([set(variable("a"), times(plus(num(1), num(2)), num(3)))]))),
    ).toBe("on join:\n    set {a} to ((1 + 2) * 3)\n");
    expect(
      emit(script(onJoin([set(variable("a"), remainder(plus(num(7), num(1)), num(3)))]))),
    ).toBe("on join:\n    set {a} to mod((7 + 1), 3)\n");
  });
  it("arithmetic embeds in format strings", () => {
    expect(
      emit(script(onJoin([broadcast(fmt("total: ", plus(variable("a"), num(1))))]))),
    ).toBe('on join:\n    broadcast "total: %({a} + 1)%"\n');
  });
});

describe("list variables (phase 12)", () => {
  it("add / remove / delete statements", () => {
    expect(emit(script(onJoin([listAdd(listVar("groceries"), str("milk"))])))).toBe(
      'on join:\n    add "milk" to {groceries::*}\n',
    );
    expect(emit(script(onJoin([listRemove(listVar("groceries"), argument(1))])))).toBe(
      "on join:\n    remove arg-1 from {groceries::*}\n",
    );
    expect(emit(script(onJoin([deleteVar(variable("groceries", num(2)))])))).toBe(
      "on join:\n    delete {groceries::%2%}\n",
    );
    expect(emit(script(onJoin([deleteVar(listVar("groceries"))])))).toBe(
      "on join:\n    delete {groceries::*}\n",
    );
    expect(emit(script(onJoin([deleteVar(variable("plain"))])))).toBe(
      "on join:\n    delete {plain}\n",
    );
  });
  it("size and whole-list expressions in value and string positions", () => {
    expect(emit(script(onJoin([set(variable("n"), listSize(listVar("groceries")))])))).toBe(
      "on join:\n    set {n} to size of {groceries::*}\n",
    );
    expect(
      emit(script(onJoin([broadcast(fmt("n=", listSize(listVar("groceries")), " all=", listVar("groceries")))]))),
    ).toBe('on join:\n    broadcast "n=%size of {groceries::*}% all=%{groceries::*}%"\n');
  });
  it("list loop exposes loop-index and loop-value", () => {
    expect(
      emit(
        script(
          onJoin([
            loopList(listVar("groceries"), [
              send(player(), fmt("item ", loopIndex(), ": ", loopValue())),
            ]),
          ]),
        ),
      ),
    ).toBe(
      'on join:\n    loop {groceries::*}:\n        send "item %loop-index%: %loop-value%" to player\n',
    );
  });
});

describe("loops, while and wait (phase 12)", () => {
  it("times loop and range loop", () => {
    expect(
      emit(script(onJoin([loopTimes(num(3), [broadcast(str("x"))])]))),
    ).toBe('on join:\n    loop 3 times:\n        broadcast "x"\n');
    expect(
      emit(script(onJoin([loopTimes(argument(1), [broadcast(str("x"))])]))),
    ).toBe('on join:\n    loop arg-1 times:\n        broadcast "x"\n');
    expect(
      emit(script(onJoin([loopRange(num(2), num(4), [broadcast(fmt("v=", loopValue()))])]))),
    ).toBe('on join:\n    loop numbers from 2 to 4:\n        broadcast "v=%loop-value%"\n');
  });
  it("while with a leaf condition and with not(leaf)", () => {
    expect(
      emit(script(onJoin([whileLoop(lessThan(variable("n"), num(3)), [add(variable("n"), num(1))])]))),
    ).toBe("on join:\n    while {n} is less than 3:\n        add 1 to {n}\n");
    expect(
      emit(script(onJoin([whileLoop(not(equals(variable("n"), num(3))), [add(variable("n"), num(1))])]))),
    ).toBe("on join:\n    while {n} is not 3:\n        add 1 to {n}\n");
  });
  it("wait in each unit", () => {
    expect(emit(script(onJoin([wait(num(20), "ticks")])))).toBe(
      "on join:\n    wait 20 ticks\n",
    );
    expect(emit(script(onJoin([wait(num(2), "seconds")])))).toBe(
      "on join:\n    wait 2 seconds\n",
    );
    expect(emit(script(onJoin([wait(num(1), "minutes")])))).toBe(
      "on join:\n    wait 1 minutes\n",
    );
    expect(emit(script(onJoin([wait(variable("delay"), "seconds")])))).toBe(
      "on join:\n    wait {delay} seconds\n",
    );
  });
});

describe("api guards", () => {
  it("whileLoop rejects composite conditions", () => {
    expect(() =>
      whileLoop(and(isOp(player()), equals(variable("a"), num(1))), []),
    ).toThrow(RangeError);
    expect(() => whileLoop(or(isOp(player()), isOp(player())), [])).toThrow(RangeError);
    expect(() => whileLoop(not(and(isOp(player()), isOp(player()))), [])).toThrow(RangeError);
    expect(() => whileLoop(not(not(isOp(player()))), [])).toThrow(RangeError);
  });
  it("listVar rejects an empty name", () => {
    expect(() => listVar("")).toThrow(RangeError);
    expect(() => listVar("  ")).toThrow(RangeError);
  });
  it("and()/or() reject fewer than two conditions", () => {
    expect(() => and(isOp(player()))).toThrow(RangeError);
    expect(() => or()).toThrow(RangeError);
  });
  it("argument() rejects index 0 and non-integers", () => {
    expect(() => argument(0)).toThrow(RangeError);
    expect(() => argument(1.5)).toThrow(RangeError);
  });
  it("blocks are separated by exactly one blank line and file ends with newline", () => {
    const out = emit(
      script(onJoin([broadcast(str("a"))]), onQuit([broadcast(str("b"))])),
    );
    expect(out).toBe('on join:\n    broadcast "a"\n\non quit:\n    broadcast "b"\n');
  });
});
