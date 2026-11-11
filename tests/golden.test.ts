import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  add,
  addTo,
  amountOf,
  and,
  argument,
  applyPotion,
  attacker,
  blockAt,
  bool,
  broadcast,
  call,
  callStmt,
  cancelEvent,
  charAt,
  chatMessage,
  chestInventory,
  clickedEntity,
  clickedRawSlotIndex,
  clickedSlotIndex,
  clockTime,
  closeInventory,
  colored,
  cmdArg,
  command,
  contains,
  currentInventoryOf,
  damageAmount,
  damageCause,
  defineFunction,
  deleteVar,
  dividedBy,
  dropItem,
  emit,
  endsWith,
  equals,
  every,
  eventBlock,
  eventInventory,
  eventItem,
  eventPlayer,
  experienceOf,
  firstChars,
  fmt,
  foodLevelOf,
  formatted,
  give,
  gameModeOf,
  gameModeType,
  giveItem,
  greaterOrEqual,
  greaterThan,
  hasPermission,
  heal,
  healthOf,
  ifElse,
  isEngineOnlyScript,
  isOp,
  item,
  joinText,
  lastChars,
  lastSpawnedEntity,
  levelOf,
  lessOrEqual,
  lessThan,
  listAdd,
  listRemove,
  listSize,
  listVar,
  localList,
  location,
  localVar,
  locationOf,
  loopIndex,
  loopList,
  loopPlayer,
  loopPlayers,
  loopRange,
  loopTimes,
  loopValue,
  loreOf,
  lowerCase,
  maxHealthOf,
  minus,
  nameOf,
  not,
  notEquals,
  num,
  onBedEnter,
  onBedLeave,
  onBlockBreak,
  onBlockPlace,
  onChat,
  onDamage,
  onDeath,
  onDrop,
  onFirstJoin,
  onInventoryClick,
  onInventoryClose,
  onJoin,
  onLeftClick,
  onPickup,
  onQuit,
  onRespawn,
  onRightClick,
  offsetLocation,
  openGui,
  openInventory,
  or,
  param,
  player,
  playSound,
  plus,
  relativeBlock,
  remainder,
  removeFrom,
  removePotion,
  replaceAllIn,
  replaceFirstIn,
  returnValue,
  script,
  saturationOf,
  send,
  set,
  setBlockAt,
  setDamage,
  setExperience,
  setFoodLevel,
  setGameMode,
  setHealth,
  setItemAmount,
  setItemLore,
  setItemName,
  setLevel,
  setMaxHealth,
  setSaturation,
  setSlot,
  setWorldTime,
  setWorldWeather,
  slotItem,
  spawnEntity,
  splitText,
  startsWith,
  stopTrigger,
  str,
  substring,
  teleport,
  textLength,
  times,
  typeOf,
  uncancelEvent,
  uncolored,
  unformatted,
  upperCase,
  variable,
  victim,
  wait,
  weatherType,
  world,
  worldOf,
  worldTime,
  worldWeather,
  xOf,
  yOf,
  zOf,
  whileLoop,
  withAmount,
  withLore,
  withName,
} from "../src/index.js";
import { welcomeScript } from "../examples/welcome.js";
import { kitScript } from "../examples/kit.js";
import { chatLogScript } from "../examples/chatlog.js";
import { deathScript } from "../examples/death.js";
import { spawnScript } from "../examples/spawn.js";
import { logicScript } from "../examples/logic.js";
import { listsScript } from "../examples/lists.js";
import { functionsScript } from "../examples/functions.js";
import { gameplayScript } from "../examples/gameplay.js";
import { textScript } from "../examples/text.js";
import { events2Script } from "../examples/events2.js";
import { guiScript } from "../examples/gui.js";
import { worldScript } from "../examples/world.js";
import { stateScript } from "../examples/state.js";
import { commandsScript } from "../examples/commands.js";

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
  it("functions", () => {
    expect(emit(functionsScript)).toBe(fixture("functions.sk"));
  });
  it("gameplay", () => {
    expect(emit(gameplayScript)).toBe(fixture("gameplay.sk"));
  });
  it("text", () => {
    expect(emit(textScript)).toBe(fixture("text.sk"));
  });
  it("events2", () => {
    expect(emit(events2Script)).toBe(fixture("events2.sk"));
  });
  it("gui", () => {
    expect(emit(guiScript)).toBe(fixture("gui.sk"));
  });
  it("world", () => {
    expect(emit(worldScript)).toBe(fixture("world.sk"));
  });
  it("state", () => {
    expect(emit(stateScript)).toBe(fixture("state.sk"));
  });
  it("commands", () => {
    expect(emit(commandsScript)).toBe(fixture("commands.sk"));
  });
});

describe("gameplay events (phase 14)", () => {
  const body = [broadcast(str("x"))];
  it("event headers", () => {
    expect(emit(script(onBlockBreak(body)))).toBe('on block break:\n    broadcast "x"\n');
    expect(emit(script(onBlockPlace(body)))).toBe('on block place:\n    broadcast "x"\n');
    expect(emit(script(onRightClick(body)))).toBe('on right click:\n    broadcast "x"\n');
    expect(emit(script(onLeftClick(body)))).toBe('on left click:\n    broadcast "x"\n');
    expect(emit(script(onDamage(body)))).toBe('on damage:\n    broadcast "x"\n');
  });
  it("event values in value position", () => {
    expect(
      emit(
        script(
          onDamage([
            set(variable("a"), eventBlock()),
            set(variable("b"), eventItem()),
            set(variable("c"), attacker()),
            set(variable("d"), damageAmount()),
            set(variable("e"), damageCause()),
            set(variable("f"), typeOf(eventBlock())),
            set(variable("g"), locationOf(eventBlock())),
          ]),
        ),
      ),
    ).toBe(
      "on damage:\n" +
        "    set {a} to event-block\n" +
        "    set {b} to event-item\n" +
        "    set {c} to attacker\n" +
        "    set {d} to damage\n" +
        "    set {e} to damage cause\n" +
        "    set {f} to type of event-block\n" +
        "    set {g} to location of event-block\n",
    );
  });
  it("event values interpolated in a format string", () => {
    expect(
      emit(
        script(
          onBlockBreak([
            broadcast(
              fmt(eventBlock(), "/", eventItem(), "/", typeOf(eventItem()), "/", damageCause()),
            ),
          ]),
        ),
      ),
    ).toBe(
      'on block break:\n    broadcast "%event-block%/%event-item%/%type of event-item%/%damage cause%"\n',
    );
  });
  it("type-of parenthesizes an arithmetic operand", () => {
    expect(
      emit(script(onDamage([set(variable("t"), typeOf(plus(num(1), num(2))))]))),
    ).toBe("on damage:\n    set {t} to type of ((1 + 2))\n");
  });
  it("cancel, uncancel and set damage statements", () => {
    expect(
      emit(
        script(
          onDamage([cancelEvent(), uncancelEvent(), setDamage(dividedBy(damageAmount(), num(2)))]),
        ),
      ),
    ).toBe("on damage:\n    cancel event\n    uncancel event\n    set damage to (damage / 2)\n");
  });
  it("block, item and entity function parameter types", () => {
    expect(
      emit(
        script(
          defineFunction(
            "lbl",
            [param("b", "block"), param("i", "item"), param("e", "entity")],
            "object",
            [returnValue(typeOf(localVar("b")))],
          ),
        ),
      ),
    ).toBe("function lbl(b: block, i: item, e: entity) :: object:\n    return type of {_b}\n");
    expect(() => param("x", "itemtype" as never)).toThrow(RangeError);
  });
  it("gameplay constructs are core language, not engine-only", () => {
    expect(isEngineOnlyScript(gameplayScript)).toBe(false);
    expect(
      isEngineOnlyScript(
        script(
          onDamage([cancelEvent(), setDamage(damageAmount())]),
          onBlockBreak([broadcast(fmt(typeOf(eventBlock()), " ", damageCause()))]),
        ),
      ),
    ).toBe(false);
  });
});

describe("event filters and more events (phase 16)", () => {
  const body = [broadcast(str("x"))];
  it("filtered block headers", () => {
    expect(emit(script(onBlockBreak(body, { block: "stone" })))).toBe(
      'on block break of stone:\n    broadcast "x"\n',
    );
    expect(emit(script(onBlockBreak(body, { block: ["stone", "dirt"] })))).toBe(
      'on block break of stone or dirt:\n    broadcast "x"\n',
    );
    expect(emit(script(onBlockPlace(body, { block: ["stone", "dirt", "gravel"] })))).toBe(
      'on block place of stone, dirt or gravel:\n    broadcast "x"\n',
    );
  });
  it("filtered damage headers: victim, attacker, or both", () => {
    expect(emit(script(onDamage(body, { victim: "player" })))).toBe(
      'on damage of player:\n    broadcast "x"\n',
    );
    expect(emit(script(onDamage(body, { attacker: "zombie" })))).toBe(
      'on damage by zombie:\n    broadcast "x"\n',
    );
    expect(
      emit(script(onDamage(body, { victim: "player", attacker: ["zombie", "skeleton"] }))),
    ).toBe('on damage of player by zombie or skeleton:\n    broadcast "x"\n');
  });
  it("filtered click headers: block, entity and held item slots", () => {
    expect(emit(script(onRightClick(body, { block: "stone" })))).toBe(
      'on right click on stone:\n    broadcast "x"\n',
    );
    expect(emit(script(onRightClick(body, { entity: "villager" })))).toBe(
      'on right click on villager:\n    broadcast "x"\n',
    );
    expect(emit(script(onRightClick(body, { block: "stone", item: "stick" })))).toBe(
      'on right click on stone with stick:\n    broadcast "x"\n',
    );
    expect(emit(script(onLeftClick(body, { item: "stick" })))).toBe(
      'on left click with stick:\n    broadcast "x"\n',
    );
  });
  it("pickup, drop, respawn and bed headers", () => {
    expect(emit(script(onPickup(body)))).toBe('on pick up:\n    broadcast "x"\n');
    expect(emit(script(onPickup(body, { item: "wheat" })))).toBe(
      'on pick up of wheat:\n    broadcast "x"\n',
    );
    expect(emit(script(onDrop(body)))).toBe('on drop:\n    broadcast "x"\n');
    expect(emit(script(onDrop(body, { item: ["egg", "compass"] })))).toBe(
      'on drop of egg or compass:\n    broadcast "x"\n',
    );
    expect(emit(script(onRespawn(body)))).toBe('on respawn:\n    broadcast "x"\n');
    expect(emit(script(onBedEnter(body)))).toBe('on bed enter:\n    broadcast "x"\n');
    expect(emit(script(onBedLeave(body)))).toBe('on bed leave:\n    broadcast "x"\n');
  });
  it("clicked entity in value and string positions", () => {
    expect(
      emit(
        script(
          onRightClick([
            set(variable("c"), clickedEntity()),
            broadcast(fmt("clicked ", clickedEntity(), " / ", typeOf(clickedEntity()))),
          ]),
        ),
      ),
    ).toBe(
      "on right click:\n" +
        "    set {c} to clicked entity\n" +
        '    broadcast "clicked %clicked entity% / %type of clicked entity%"\n',
    );
  });
  it("filter validation", () => {
    expect(() => onBlockBreak(body, { block: [] })).toThrow(RangeError);
    expect(() => onBlockBreak(body, { block: "  " })).toThrow(RangeError);
    expect(() => onDamage(body, { victim: ["player", ""] })).toThrow(RangeError);
    expect(() => onRightClick(body, { block: "stone", entity: "zombie" })).toThrow(
      RangeError,
    );
    expect(() =>
      onPickup(body, { block: "stone" } as unknown as { item: string }),
    ).toThrow(RangeError);
    // An empty options object is the unfiltered event.
    expect(emit(script(onBlockBreak(body, {})))).toBe(
      'on block break:\n    broadcast "x"\n',
    );
  });
  it("the new constructs are core language, not engine-only", () => {
    expect(isEngineOnlyScript(events2Script)).toBe(false);
    expect(
      isEngineOnlyScript(
        script(
          onDamage([broadcast(fmt(clickedEntity()))], {
            victim: "player",
            attacker: "zombie",
          }),
          onPickup([cancelEvent()], { item: "wheat" }),
          onBedEnter([broadcast(str("z"))]),
        ),
      ),
    ).toBe(false);
  });
});

describe("custom functions (phase 13)", () => {
  it("definition with a return type and a default", () => {
    expect(
      emit(
        script(
          defineFunction("f", [param("a", "number"), param("b", "text", str("x"))], "text", [
            returnValue(localVar("b")),
          ]),
        ),
      ),
    ).toBe('function f(a: number, b: text = "x") :: text:\n    return {_b}\n');
  });
  it("void definition without parameters", () => {
    expect(
      emit(script(defineFunction("g", [], null, [broadcast(str("y"))]))),
    ).toBe('function g():\n    broadcast "y"\n');
  });
  it("plural parameter definition", () => {
    expect(
      emit(
        script(
          defineFunction("h", [param("ns", "numbers")], "number", [
            returnValue(num(0)),
          ]),
        ),
      ),
    ).toBe("function h(ns: numbers) :: number:\n    return 0\n");
  });
  it("call as an expression, a nested call, and a bare call statement", () => {
    expect(
      emit(
        script(
          onJoin([
            set(variable("x"), call("f", num(1), call("g", num(2)))),
            callStmt("h"),
          ]),
        ),
      ),
    ).toBe("on join:\n    set {x} to f(1, g(2))\n    h()\n");
  });
  it("call interpolated in a string, with a text literal argument", () => {
    expect(
      emit(script(onJoin([send(player(), fmt("r=", call("greet", str("World"))))]))),
    ).toBe('on join:\n    send "r=%greet("World")%" to player\n');
  });
  it("send accepts a bare call as the message", () => {
    expect(
      emit(script(onJoin([send(player(), call("greet", str("x")))]))),
    ).toBe('on join:\n    send greet("x") to player\n');
  });
  it("local variables and local lists", () => {
    expect(
      emit(
        script(
          onJoin([
            set(localVar("v"), num(1)),
            set(localList("l"), variable("src")),
            set(variable("dst"), localList("l")),
            add(localVar("v", player()), num(2)),
          ]),
        ),
      ),
    ).toBe(
      "on join:\n    set {_v} to 1\n    set {_l::*} to {src}\n    set {dst} to {_l::*}\n    add 2 to {_v::%player%}\n",
    );
  });
  it("return and stop", () => {
    expect(
      emit(
        script(
          defineFunction("k", [], "number", [
            ifElse(equals(variable("a"), num(1)), [stopTrigger()]),
            returnValue(num(3)),
          ]),
        ),
      ),
    ).toBe(
      "function k() :: number:\n    if {a} is 1:\n        stop\n    return 3\n",
    );
  });
  it("api guards: defineFunction and param validation", () => {
    expect(() => defineFunction("bad name", [], null, [])).toThrow(RangeError);
    expect(() => defineFunction("ok", [], "integer" as never, [])).toThrow(RangeError);
    expect(() => param("x", "integer" as never)).toThrow(RangeError);
    expect(() => param("1x", "number")).toThrow(RangeError);
    expect(() =>
      defineFunction("two", [param("a", "numbers"), param("b", "number")], null, []),
    ).toThrow(RangeError);
    expect(() => call("bad name")).toThrow(RangeError);
    expect(() => localVar("")).toThrow(RangeError);
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

describe("commands (phase 20)", () => {
  it("multiple typed arguments, required and optional", () => {
    expect(
      emit(
        script(
          command("mix", [cmdArg("player"), cmdArg("integer", true), cmdArg("text")], [
            broadcast(str("x")),
          ]),
        ),
      ),
    ).toBe(
      'command /mix <player> [<integer>] <text>:\n    trigger:\n        broadcast "x"\n',
    );
  });
  it("the newer argument types, with offline player spelled as two words", () => {
    expect(
      emit(
        script(
          command("types", [
            cmdArg("number"),
            cmdArg("boolean"),
            cmdArg("item"),
            cmdArg("offlinePlayer"),
          ], [broadcast(str("x"))]),
        ),
      ),
    ).toBe(
      'command /types <number> <boolean> <item> <offline player>:\n    trigger:\n        broadcast "x"\n',
    );
  });
  it("permission, usage and aliases sections precede the trigger", () => {
    expect(
      emit(
        script(
          command("adm", [cmdArg("integer")], [broadcast(str("x"))], {
            permission: "test.admin",
            usage: "/adm <n>",
            aliases: ["/ad2", "ad3"],
          }),
        ),
      ),
    ).toBe(
      'command /adm <integer>:\n    permission: test.admin\n    usage: /adm <n>\n    aliases: /ad2, ad3\n    trigger:\n        broadcast "x"\n',
    );
  });
  it("options also attach to the legacy single-argument form", () => {
    expect(
      emit(
        script(command("one", "text", [broadcast(str("x"))], { permission: "test.one" })),
      ),
    ).toBe(
      'command /one [<text>]:\n    permission: test.one\n    trigger:\n        broadcast "x"\n',
    );
  });
  it("an unknown argument type and a boolean fourth argument are rejected", () => {
    expect(() => cmdArg("bogus" as never)).toThrow(RangeError);
    expect(() =>
      command("x", [cmdArg("text")], [broadcast(str("x"))], true as never),
    ).toThrow(RangeError);
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

describe("text operations (phase 15)", () => {
  it("length, substring family and case conversion in value position", () => {
    expect(
      emit(
        script(
          onJoin([
            set(variable("a"), textLength(str("hello"))),
            set(variable("b"), substring(localVar("s"), num(2), num(4))),
            set(variable("c"), firstChars(localVar("s"), num(2))),
            set(variable("d"), lastChars(localVar("s"), num(2))),
            set(variable("e"), charAt(localVar("s"), num(1))),
            set(variable("f"), upperCase(localVar("s"))),
            set(variable("g"), lowerCase(localVar("s"))),
          ]),
        ),
      ),
    ).toBe(
      "on join:\n" +
        "    set {a} to length of \"hello\"\n" +
        "    set {b} to substring of {_s} from 2 to 4\n" +
        "    set {c} to first 2 characters of {_s}\n" +
        "    set {d} to last 2 characters of {_s}\n" +
        "    set {e} to character at 1 in {_s}\n" +
        "    set {f} to {_s} in uppercase\n" +
        "    set {g} to {_s} in lowercase\n",
    );
  });
  it("split and join forms", () => {
    expect(
      emit(
        script(
          onJoin([
            set(localList("p"), splitText(str("a,b"), str(","))),
            set(localList("q"), splitText(str("aAb"), str("a"), true)),
            set(variable("a"), joinText(localList("p"), str("-"))),
            set(variable("b"), joinText(localList("p"))),
            set(variable("c"), joinText(splitText(argument(1), str(",")), str("+"))),
          ]),
        ),
      ),
    ).toBe(
      "on join:\n" +
        "    set {_p::*} to split \"a,b\" at \",\"\n" +
        "    set {_q::*} to split \"aAb\" at \"a\" with case sensitivity\n" +
        "    set {a} to join {_p::*} with \"-\"\n" +
        "    set {b} to join {_p::*}\n" +
        "    set {c} to join split arg-1 at \",\" with \"+\"\n",
    );
  });
  it("color expressions in value position", () => {
    expect(
      emit(
        script(
          onJoin([
            set(variable("a"), colored(str("&aX"))),
            set(variable("b"), formatted(str("<b>Bold</b>"))),
            set(variable("c"), uncolored(variable("a"))),
            set(variable("d"), unformatted(variable("a"))),
          ]),
        ),
      ),
    ).toBe(
      "on join:\n" +
        "    set {a} to colored \"&aX\"\n" +
        "    set {b} to formatted \"<b>Bold</b>\"\n" +
        "    set {c} to uncolored {a}\n" +
        "    set {d} to unformatted {a}\n",
    );
  });
  it("text conditions and their native negations", () => {
    expect(
      emit(
        script(
          onJoin([
            ifElse(contains(localVar("s"), str("ell")), [broadcast(str("y"))]),
            ifElse(not(contains(localVar("s"), str("z"))), [broadcast(str("y"))]),
            ifElse(startsWith(localVar("s"), str("he")), [broadcast(str("y"))]),
            ifElse(not(startsWith(localVar("s"), str("x"))), [broadcast(str("y"))]),
            ifElse(endsWith(localVar("s"), str("lo")), [broadcast(str("y"))]),
            ifElse(not(endsWith(localVar("s"), str("x"))), [broadcast(str("y"))]),
            ifElse(contains(listVar("l"), str("banana")), [broadcast(str("y"))]),
          ]),
        ),
      ),
    ).toBe(
      "on join:\n" +
        "    if {_s} contains \"ell\":\n" +
        "        broadcast \"y\"\n" +
        "    if {_s} does not contain \"z\":\n" +
        "        broadcast \"y\"\n" +
        "    if {_s} starts with \"he\":\n" +
        "        broadcast \"y\"\n" +
        "    if {_s} does not start with \"x\":\n" +
        "        broadcast \"y\"\n" +
        "    if {_s} ends with \"lo\":\n" +
        "        broadcast \"y\"\n" +
        "    if {_s} does not end with \"x\":\n" +
        "        broadcast \"y\"\n" +
        "    if {l::*} contains \"banana\":\n" +
        "        broadcast \"y\"\n",
    );
  });
  it("text conditions can head a while loop", () => {
    expect(
      emit(
        script(
          onJoin([
            whileLoop(contains(localVar("s"), str("x")), [broadcast(str("y"))]),
            whileLoop(not(startsWith(localVar("s"), str("x"))), [broadcast(str("y"))]),
          ]),
        ),
      ),
    ).toBe(
      "on join:\n" +
        "    while {_s} contains \"x\":\n" +
        "        broadcast \"y\"\n" +
        "    while {_s} does not start with \"x\":\n" +
        "        broadcast \"y\"\n",
    );
  });
  it("replace statements", () => {
    expect(
      emit(
        script(
          onJoin([
            replaceAllIn(localVar("t"), str("a"), str("o")),
            replaceFirstIn(localVar("t"), str("a"), str("o")),
            replaceAllIn(variable("g"), str("a"), str("o"), true),
          ]),
        ),
      ),
    ).toBe(
      "on join:\n" +
        "    replace all \"a\" in {_t} with \"o\"\n" +
        "    replace first \"a\" in {_t} with \"o\"\n" +
        "    replace all \"a\" in {g} with \"o\" with case sensitivity\n",
    );
  });
  it("text expressions interpolate into format strings", () => {
    expect(
      emit(
        script(
          onJoin([
            broadcast(
              fmt(
                "len=",
                textLength(localVar("s")),
                " up=",
                upperCase(localVar("s")),
                " has=",
                joinText(splitText(localVar("s"), str(",")), str("+")),
              ),
            ),
          ]),
        ),
      ),
    ).toBe(
      "on join:\n" +
        "    broadcast \"len=%length of {_s}% up=%{_s} in uppercase% has=%join split {_s} at \",\" with \"+\"%\"\n",
    );
  });
  it("the text sample is core language, not engine-only", () => {
    expect(isEngineOnlyScript(textScript)).toBe(false);
  });
});

describe("items, inventories and GUIs (phase 17)", () => {
  it("item construction suffixes compose in value position", () => {
    expect(
      emit(
        script(
          onJoin([
            set(variable("a"), withName(item("diamond sword"), str("Gem Blade"))),
            set(variable("b"), withLore(item("diamond"), str("one"), str("two"), str("three"))),
            set(variable("c"), withAmount(item("stone"), num(3))),
            set(
              variable("d"),
              withAmount(withLore(withName(item("diamond sword"), str("Gem")), str("line")), num(2)),
            ),
            set(variable("e"), withName(localVar("base"), variable("n"))),
          ]),
        ),
      ),
    ).toBe(
      "on join:\n" +
        "    set {a} to diamond sword named \"Gem Blade\"\n" +
        "    set {b} to diamond with lore \"one\", \"two\" and \"three\"\n" +
        "    set {c} to 3 of stone\n" +
        "    set {d} to 2 of diamond sword named \"Gem\" with lore \"line\"\n" +
        "    set {e} to {_base} named {n}\n",
    );
  });
  it("meta statements rewrite the item a variable holds", () => {
    expect(
      emit(
        script(
          onJoin([
            setItemName(localVar("i"), str("Renamed")),
            setItemLore(localVar("i"), str("only line")),
            setItemAmount(localVar("i"), num(5)),
            giveItem(player(), localVar("i")),
          ]),
        ),
      ),
    ).toBe(
      "on join:\n" +
        "    set name of {_i} to \"Renamed\"\n" +
        "    set lore of {_i} to \"only line\"\n" +
        "    set amount of {_i} to 5\n" +
        "    give {_i} to player\n",
    );
  });
  it("name, lore and amount reads in value and string positions", () => {
    expect(
      emit(
        script(
          onJoin([
            set(variable("a"), nameOf(variable("i"))),
            set(localList("l"), loreOf(variable("i"))),
            set(variable("n"), amountOf(variable("i"))),
            broadcast(fmt("n=", nameOf(eventInventory()), " a=", amountOf(eventItem()))),
          ]),
        ),
      ),
    ).toBe(
      "on join:\n" +
        "    set {a} to name of {i}\n" +
        "    set {_l::*} to lore of {i}\n" +
        "    set {n} to amount of {i}\n" +
        "    broadcast \"n=%name of event-inventory% a=%amount of event-item%\"\n",
    );
  });
  it("inventory values and slot access", () => {
    expect(
      emit(
        script(
          onJoin([
            set(localVar("inv"), chestInventory(num(2), str("Box"))),
            set(localVar("plain"), chestInventory(num(1))),
            setSlot(localVar("inv"), num(4), item("emerald")),
            setSlot(currentInventoryOf(player()), num(0), slotItem(localVar("inv"), num(4))),
            setSlot(player(), num(9), item("stone")),
            openInventory(player(), localVar("inv")),
            closeInventory(player()),
          ]),
        ),
      ),
    ).toBe(
      "on join:\n" +
        "    set {_inv} to chest inventory with 2 rows named \"Box\"\n" +
        "    set {_plain} to chest inventory with 1 rows\n" +
        "    set slot 4 of {_inv} to emerald\n" +
        "    set slot 0 of player's current inventory to slot 4 of {_inv}\n" +
        "    set slot 9 of player to stone\n" +
        "    open {_inv} to player\n" +
        "    close player's inventory\n",
    );
  });
  it("open GUI direct form, with and without a title", () => {
    expect(
      emit(script(onJoin([openGui(player(), num(3), str("Shop Menu"))]))),
    ).toBe('on join:\n    open chest inventory with 3 rows named "Shop Menu" to player\n');
    expect(emit(script(onJoin([openGui(player(), num(2))])))).toBe(
      "on join:\n    open chest inventory with 2 rows to player\n",
    );
  });
  it("inventory event headers and values", () => {
    const body = [broadcast(str("x"))];
    expect(emit(script(onInventoryClick(body)))).toBe(
      'on inventory click:\n    broadcast "x"\n',
    );
    expect(emit(script(onInventoryClose(body)))).toBe(
      'on inventory close:\n    broadcast "x"\n',
    );
    expect(
      emit(
        script(
          onInventoryClick([
            broadcast(
              fmt(
                "s=",
                clickedSlotIndex(),
                " r=",
                clickedRawSlotIndex(),
                " inv=",
                eventInventory(),
                " it=",
                eventItem(),
              ),
            ),
          ]),
        ),
      ),
    ).toBe(
      "on inventory click:\n" +
        "    broadcast \"s=%index of event-slot% r=%raw index of event-slot% inv=%event-inventory% it=%event-item%\"\n",
    );
  });
  it("api guards: lore needs at least one line", () => {
    expect(() => withLore(item("stone"))).toThrow(RangeError);
    expect(() => setItemLore(localVar("i"))).toThrow(RangeError);
  });
  it("the GUI sample is core language, not engine-only", () => {
    expect(isEngineOnlyScript(guiScript)).toBe(false);
  });
});

describe("world operations and periodical events (phase 18)", () => {
  it("block, location, coordinate and offset expressions in value position", () => {
    expect(
      emit(
        script(
          onJoin([
            set(localVar("b"), blockAt(localVar("l"))),
            set(localVar("l2"), location(num(10), num(64), num(-5))),
            set(localVar("l3"), location(num(10), num(64), num(-5), world("world"))),
            set(localVar("x"), xOf(localVar("l"))),
            set(localVar("y"), yOf(localVar("l"))),
            set(localVar("z"), zOf(localVar("l"))),
            set(localVar("o"), offsetLocation(localVar("l"), num(2), num(0), num(-1))),
          ]),
        ),
      ),
    ).toBe(
      "on join:\n" +
        "    set {_b} to block at {_l}\n" +
        "    set {_l2} to location(10, 64, -5)\n" +
        "    set {_l3} to location(10, 64, -5, world \"world\")\n" +
        "    set {_x} to x-coordinate of {_l}\n" +
        "    set {_y} to y-coordinate of {_l}\n" +
        "    set {_z} to z-coordinate of {_l}\n" +
        "    set {_o} to {_l} ~ vector(2, 0, -1)\n",
    );
  });
  it("relative blocks: every direction phrase, with and without a count", () => {
    expect(
      emit(
        script(
          onJoin([
            set(localVar("a"), relativeBlock(eventBlock(), "above")),
            set(localVar("b"), relativeBlock(eventBlock(), "below", 2)),
            set(localVar("c"), relativeBlock(eventBlock(), "north")),
            set(localVar("d"), relativeBlock(eventBlock(), "south", 3)),
            set(localVar("e"), relativeBlock(eventBlock(), "east")),
            set(localVar("f"), relativeBlock(eventBlock(), "west")),
            set(localVar("g"), relativeBlock(eventBlock(), "front")),
            set(localVar("h"), relativeBlock(eventBlock(), "behind", 2)),
          ]),
        ),
      ),
    ).toBe(
      "on join:\n" +
        "    set {_a} to block above event-block\n" +
        "    set {_b} to block 2 below event-block\n" +
        "    set {_c} to block north of event-block\n" +
        "    set {_d} to block 3 south of event-block\n" +
        "    set {_e} to block east of event-block\n" +
        "    set {_f} to block west of event-block\n" +
        "    set {_g} to block in front of event-block\n" +
        "    set {_h} to block 2 behind event-block\n",
    );
  });
  it("world, time and weather expressions and statements", () => {
    expect(
      emit(
        script(
          onJoin([
            set(localVar("w"), world("world")),
            set(localVar("w2"), worldOf(player())),
            set(localVar("t"), worldTime(localVar("w"))),
            set(localVar("x"), worldWeather(localVar("w"))),
            ifElse(equals(localVar("x"), weatherType("rain")), [broadcast(str("wet"))]),
            ifElse(equals(localVar("t"), clockTime("13:00")), [broadcast(str("one"))]),
            setWorldTime(localVar("w"), clockTime("6:00")),
            setWorldTime(localVar("w"), localVar("t")),
            setWorldWeather(localVar("w"), "thunder"),
            setBlockAt(localVar("l"), item("gold block")),
          ]),
        ),
      ),
    ).toBe(
      "on join:\n" +
        "    set {_w} to world \"world\"\n" +
        "    set {_w2} to world of player\n" +
        "    set {_t} to time in {_w}\n" +
        "    set {_x} to weather in {_w}\n" +
        "    if {_x} is rain:\n" +
        "        broadcast \"wet\"\n" +
        "    if {_t} is 13:00:\n" +
        "        broadcast \"one\"\n" +
        "    set time in {_w} to 6:00\n" +
        "    set time in {_w} to {_t}\n" +
        "    set weather in {_w} to thunder\n" +
        "    set block at {_l} to gold block\n",
    );
  });
  it("periodical headers in each unit, fractional amounts included", () => {
    const body = [broadcast(str("x"))];
    expect(emit(script(every(3, "seconds", body)))).toBe(
      'every 3 seconds:\n    broadcast "x"\n',
    );
    expect(emit(script(every(2.5, "seconds", body)))).toBe(
      'every 2.5 seconds:\n    broadcast "x"\n',
    );
    expect(emit(script(every(40, "ticks", body)))).toBe(
      'every 40 ticks:\n    broadcast "x"\n',
    );
    expect(emit(script(every(1, "minutes", body)))).toBe(
      'every 1 minutes:\n    broadcast "x"\n',
    );
  });
  it("api guards: period, clock, weather and direction validation", () => {
    expect(() => every(0, "seconds", [])).toThrow(RangeError);
    expect(() => every(-1, "seconds", [])).toThrow(RangeError);
    expect(() => every(1, "hours" as never, [])).toThrow(RangeError);
    expect(() => clockTime("25:00")).toThrow(RangeError);
    expect(() => clockTime("9:60")).toThrow(RangeError);
    expect(() => clockTime("nine")).toThrow(RangeError);
    expect(() => weatherType("snow" as never)).toThrow(RangeError);
    expect(() => setWorldWeather(world("world"), "snow" as never)).toThrow(RangeError);
    expect(() => world("")).toThrow(RangeError);
    expect(() => relativeBlock(eventBlock(), "up" as never)).toThrow(RangeError);
    expect(() => relativeBlock(eventBlock(), "above", 0)).toThrow(RangeError);
    // clockTime canonicalizes: a padded hour reads back unpadded.
    expect(emit(script(onJoin([setWorldTime(world("world"), clockTime("06:05"))])))).toBe(
      'on join:\n    set time in world "world" to 6:05\n',
    );
  });
  it("the world sample is core language, not engine-only", () => {
    expect(isEngineOnlyScript(worldScript)).toBe(false);
    expect(
      isEngineOnlyScript(
        script(
          every(5, "seconds", [broadcast(fmt("t=", worldTime(world("world"))))]),
          onJoin([setBlockAt(location(num(1), num(2), num(3)), item("stone"))]),
        ),
      ),
    ).toBe(false);
  });
});

describe("player state and effects (phase 19)", () => {
  it("state expressions in value position", () => {
    expect(
      emit(
        script(
          onJoin([
            set(localVar("h"), healthOf(player())),
            set(localVar("m"), maxHealthOf(player())),
            set(localVar("f"), foodLevelOf(player())),
            set(localVar("s"), saturationOf(player())),
            set(localVar("g"), gameModeOf(player())),
            set(localVar("x"), experienceOf(player())),
            set(localVar("l"), levelOf(player())),
            set(localVar("e"), lastSpawnedEntity()),
          ]),
        ),
      ),
    ).toBe(
      "on join:\n" +
        "    set {_h} to health of player\n" +
        "    set {_m} to max health of player\n" +
        "    set {_f} to food level of player\n" +
        "    set {_s} to saturation of player\n" +
        "    set {_g} to gamemode of player\n" +
        "    set {_x} to experience of player\n" +
        "    set {_l} to level of player\n" +
        "    set {_e} to last spawned entity\n",
    );
  });
  it("state expressions interpolate into texts", () => {
    expect(
      emit(script(onJoin([broadcast(fmt("hp=", healthOf(player()), " gm=", gameModeOf(player())))]))),
    ).toBe('on join:\n    broadcast "hp=%health of player% gm=%gamemode of player%"\n');
  });
  it("gamemode comparisons use the bare literal", () => {
    expect(
      emit(
        script(
          onJoin([
            ifElse(equals(gameModeOf(player()), gameModeType("creative")), [broadcast(str("c"))]),
          ]),
        ),
      ),
    ).toBe('on join:\n    if gamemode of player is creative:\n        broadcast "c"\n');
  });
  it("state set statements and heal", () => {
    expect(
      emit(
        script(
          onJoin([
            setHealth(player(), num(6)),
            setMaxHealth(player(), num(15)),
            setFoodLevel(player(), num(4)),
            setSaturation(player(), num(2.5)),
            setGameMode(player(), "creative"),
            setExperience(player(), num(50)),
            setLevel(player(), num(2)),
            heal(player()),
            heal(player(), num(2)),
          ]),
        ),
      ),
    ).toBe(
      "on join:\n" +
        "    set health of player to 6\n" +
        "    set max health of player to 15\n" +
        "    set food level of player to 4\n" +
        "    set saturation of player to 2.5\n" +
        "    set gamemode of player to creative\n" +
        "    set experience of player to 50\n" +
        "    set level of player to 2\n" +
        "    heal player\n" +
        "    heal player by 2\n",
    );
  });
  it("generic add / remove changers over state expressions", () => {
    expect(
      emit(
        script(
          onJoin([
            addTo(experienceOf(player()), num(41)),
            addTo(healthOf(victim()), num(1)),
            removeFrom(foodLevelOf(player()), num(3)),
            removeFrom(levelOf(player()), num(1)),
          ]),
        ),
      ),
    ).toBe(
      "on join:\n" +
        "    add 41 to experience of player\n" +
        "    add 1 to health of victim\n" +
        "    remove 3 from food level of player\n" +
        "    remove 1 from level of player\n",
    );
  });
  it("potion apply and remove forms", () => {
    expect(
      emit(
        script(
          onJoin([
            applyPotion(player(), "speed"),
            applyPotion(player(), "regeneration", { durationSeconds: 6 }),
            applyPotion(player(), "speed", { level: 2, durationSeconds: 10 }),
            applyPotion(player(), "instant health"),
            applyPotion(player(), "swiftness"),
            removePotion(player(), "poison"),
          ]),
        ),
      ),
    ).toBe(
      "on join:\n" +
        "    apply speed to player\n" +
        "    apply regeneration to player for 6 seconds\n" +
        "    apply speed 2 to player for 10 seconds\n" +
        "    apply instant health to player\n" +
        "    apply swiftness to player\n" +
        "    remove poison from player\n",
    );
  });
  it("spawn, drop and sound effects", () => {
    expect(
      emit(
        script(
          onJoin([
            spawnEntity("zombie", locationOf(player())),
            spawnEntity("cow", locationOf(player()), 2),
            spawnEntity("cave spider", locationOf(player())),
            dropItem(withAmount(item("diamond"), num(1)), locationOf(player())),
            playSound("block.note_block.pling", locationOf(player())),
            playSound("entity.player.levelup", player()),
          ]),
        ),
      ),
    ).toBe(
      "on join:\n" +
        "    spawn zombie at location of player\n" +
        "    spawn 2 of cow at location of player\n" +
        "    spawn cave spider at location of player\n" +
        "    drop 1 of diamond at location of player\n" +
        '    play sound "block.note_block.pling" at location of player\n' +
        '    play sound "entity.player.levelup" at player\n',
    );
  });
  it("api guards: gamemode, potion, spawn and sound validation", () => {
    expect(() => gameModeType("hardcore" as never)).toThrow(RangeError);
    expect(() => setGameMode(player(), "hardcore" as never)).toThrow(RangeError);
    expect(() => applyPotion(player(), "swiftnes")).toThrow(RangeError);
    expect(() => applyPotion(player(), "speed", { level: 0 })).toThrow(RangeError);
    expect(() => applyPotion(player(), "speed", { level: 1.5 })).toThrow(RangeError);
    expect(() => applyPotion(player(), "speed", { durationSeconds: 0 })).toThrow(RangeError);
    expect(() => applyPotion(player(), "speed", { durationSeconds: -3 })).toThrow(RangeError);
    expect(() => removePotion(player(), "glow")).toThrow(RangeError);
    expect(() => spawnEntity("zombie!", locationOf(player()))).toThrow(RangeError);
    expect(() => spawnEntity("zombie", locationOf(player()), 0)).toThrow(RangeError);
    expect(() => spawnEntity("zombie", locationOf(player()), 1.5)).toThrow(RangeError);
    expect(() => playSound("bad name", locationOf(player()))).toThrow(RangeError);
    expect(() => playSound("", locationOf(player()))).toThrow(RangeError);
    expect(() => addTo(variable("x"), num(1))).toThrow(RangeError);
    expect(() => removeFrom(saturationOf(player()), num(1))).toThrow(RangeError);
    // Potion names canonicalize (case and spacing).
    expect(emit(script(onJoin([applyPotion(player(), " Fire  Resistance ")])))).toBe(
      "on join:\n    apply fire resistance to player\n",
    );
  });
  it("the state sample is core language, not engine-only", () => {
    expect(isEngineOnlyScript(stateScript)).toBe(false);
  });
});
