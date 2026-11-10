import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  add,
  argument,
  bool,
  broadcast,
  chatMessage,
  command,
  emit,
  eventPlayer,
  fmt,
  give,
  hasPermission,
  ifElse,
  isOp,
  item,
  locationOf,
  loopPlayer,
  loopPlayers,
  num,
  onChat,
  onDeath,
  onFirstJoin,
  onJoin,
  onQuit,
  player,
  script,
  send,
  set,
  str,
  teleport,
  variable,
  victim,
} from "../src/index.js";
import { welcomeScript } from "../examples/welcome.js";
import { kitScript } from "../examples/kit.js";
import { chatLogScript } from "../examples/chatlog.js";
import { deathScript } from "../examples/death.js";
import { spawnScript } from "../examples/spawn.js";

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

describe("api guards", () => {
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
