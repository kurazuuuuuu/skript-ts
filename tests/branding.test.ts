import { describe, expect, it } from "vitest";
import {
  addBossBarViewer,
  asEntity,
  asNum,
  blockAt,
  bool,
  bossBar,
  call,
  chatMessage,
  chestInventory,
  defineFn,
  eventInventory,
  fmt,
  giveItem,
  healthOf,
  item,
  keyedBossBarOf,
  localVar,
  location,
  locationOf,
  nameOf,
  now,
  num,
  onDamage,
  onHttpResponse,
  param,
  player,
  returnValue,
  setBlockAt,
  setBossBarProgress,
  slotItem,
  str,
  teleport,
  timespan,
  variable,
  victim,
  withAmount,
  world,
  worldOf,
  worldTime,
  x,
} from "../src/index.js";
import type {
  BossBarExpr,
  DateExpr,
  EntityExpr,
  InventoryExpr,
  LocationExpr,
  NumExpr,
  PlayerExpr,
  TextExpr,
  TimespanExpr,
  WorldExpr,
} from "../src/index.js";

// Branded expression kinds (feedback T1, full rollout): the brands
// are type-only, so at runtime every branded builder still builds
// exactly the plain AST node it built before the rollout.
describe("branded expression kinds (T1 full rollout)", () => {
  it("branded builders build the same plain nodes as before", () => {
    expect(locationOf(player())).toEqual({ kind: "locationOf", target: { kind: "player" } });
    expect(healthOf(player())).toEqual({ kind: "healthOf", target: { kind: "player" } });
    expect(worldOf(player())).toEqual({ kind: "worldOf", target: { kind: "player" } });
    expect(now()).toEqual({ kind: "now" });
    expect(timespan(5, "seconds")).toEqual({ kind: "timespan", amount: 5, unit: "seconds" });
    expect(bossBar()).toEqual({ kind: "bossBar" });
    expect(eventInventory()).toEqual({ kind: "eventInventory" });
    expect(nameOf(player())).toEqual({ kind: "nameOf", target: { kind: "player" } });
  });

  it("branded values keep flowing through generic positions", () => {
    // A branded expression is still an Expr: variables, calls and
    // fmt parts accept every brand without a cast.
    expect(fmt("hp=", healthOf(player()))).toEqual({
      kind: "format",
      parts: ["hp=", { kind: "healthOf", target: { kind: "player" } }],
    });
    expect(call("f", worldOf(player()))).toEqual({
      kind: "functionCall",
      name: "f",
      args: [{ kind: "worldOf", target: { kind: "player" } }],
    });
  });
});

// Compile-time checks for the branded slots. This function is
// never called; `pnpm typecheck` is what verifies it — each
// ts-expect-error directive below fails the typecheck if the
// line it sits on ever becomes valid TypeScript (the
// eventctx.ts / fnhandles.ts convention).
function brandingTypeChecks(): void {
  const needsPlayer = defineFn("brNeedsPlayer", [param("who", "player")], "number", [
    returnValue(num(1)),
  ]);
  const needsNum = defineFn("brNeedsNum", [param("n", "number")], "number", [returnValue(num(1))]);
  const needsText = defineFn("brNeedsText", [param("s", "text")], "number", [returnValue(num(1))]);
  const needsBool = defineFn("brNeedsBool", [param("b", "boolean")], "number", [
    returnValue(num(1)),
  ]);

  // Return brands: a player is an entity, never the other way
  // round; the new brands land in their own types.
  const asEntityValue: EntityExpr = player();
  const asNumValue: NumExpr = healthOf(player());
  const asTextValue: TextExpr = nameOf(player());
  const asWorldValue: WorldExpr = worldOf(player());
  const asInventoryValue: InventoryExpr = eventInventory();
  const asBossBarValue: BossBarExpr = bossBar();
  const asTimespanValue: TimespanExpr = timespan(5, "seconds");
  const asDateValue: DateExpr = now();
  const asLocationValue: LocationExpr = x(player()).location().unwrap();
  const asChainNum: NumExpr = x(player()).health().unwrap();
  void asEntityValue;
  void asNumValue;
  void asTextValue;
  void asWorldValue;
  void asInventoryValue;
  void asBossBarValue;
  void asTimespanValue;
  void asDateValue;
  void asLocationValue;
  void asChainNum;
  // @ts-expect-error an entity is not a player
  const notPlayer: PlayerExpr = victim();
  void notPlayer;
  // @ts-expect-error an item is not a number
  const notNum: NumExpr = item("stone");
  void notNum;

  // defineFn handle slots for number / text / boolean now reject
  // wrongly-branded expressions (they previously accepted any
  // Expr), while branded-correct and unbranded reads still pass.
  needsNum(num(3));
  needsNum(healthOf(player()));
  needsNum(variable("n"));
  // @ts-expect-error an item cannot fill a number parameter
  needsNum(item("stone"));
  // @ts-expect-error a text cannot fill a number parameter
  needsNum(str("3"));
  // @ts-expect-error a boolean cannot fill a number parameter
  needsNum(bool(true));
  needsText(str("x"));
  needsText(fmt("x"));
  needsText(chatMessage());
  needsText(variable("s"));
  // @ts-expect-error a number cannot fill a text parameter
  needsText(num(3));
  needsBool(bool(true));
  needsBool(variable("b"));
  // @ts-expect-error a number cannot fill a boolean parameter
  needsBool(num(1));
  needsPlayer(player());
  // @ts-expect-error an entity cannot fill a player parameter
  needsPlayer(victim());

  // Direct builder slots (the lenient ExprInput tier): branded or
  // unbranded pass, wrongly-branded fails.
  teleport(player(), locationOf(player()));
  teleport(victim(), variable("spawn"));
  // @ts-expect-error an item is not a teleport target
  teleport(item("stone"), locationOf(player()));
  // @ts-expect-error an item is not a teleport destination
  teleport(player(), item("stone"));
  // @ts-expect-error a number is not a teleport destination
  teleport(player(), healthOf(player()));
  healthOf(victim());
  healthOf(variable("mob"));
  // @ts-expect-error an item has no health
  healthOf(item("stone"));
  // @ts-expect-error a location has no health
  healthOf(locationOf(player()));
  giveItem(player(), withAmount(item("diamond"), num(2)));
  giveItem(player(), localVar("i"));
  // @ts-expect-error giveItem hands items to a player, not to any entity
  giveItem(victim(), item("diamond"));
  // @ts-expect-error a number is not an item to give
  giveItem(player(), healthOf(player()));
  blockAt(locationOf(player()));
  // @ts-expect-error an item is not a location to look up a block at
  blockAt(item("stone"));
  setBlockAt(localVar("spot"), item("stone"));
  // @ts-expect-error a player is not an item to place
  setBlockAt(locationOf(player()), player());
  location(num(1), variable("y"), healthOf(player()));
  // @ts-expect-error a text is not a coordinate
  location(str("1"), num(2), num(3));
  worldTime(world("world"));
  worldTime(worldOf(player()));
  // @ts-expect-error a player is not a world
  worldTime(player());
  slotItem(eventInventory(), num(0));
  slotItem(player(), num(0));
  slotItem(chestInventory(num(3)), num(0));
  // @ts-expect-error an item is not an inventory
  slotItem(item("stone"), num(0));
  setBossBarProgress(bossBar(), num(0.5));
  setBossBarProgress(variable("bar"), variable("p"));
  // @ts-expect-error a player is not a boss bar
  setBossBarProgress(player(), num(0.5));
  addBossBarViewer(keyedBossBarOf(str("k")), player());
  // @ts-expect-error a boss bar viewer must be a player
  addBossBarViewer(bossBar(), victim());

  // Maybe integration: a Maybe value carries no definite brand,
  // so it fills neither a strict handle slot nor a lenient
  // ExprInput slot; an explicit cast asserts presence.
  onDamage((ctx) => {
    // @ts-expect-error a Maybe attacker cannot fill a definite entity slot
    teleport(ctx.attacker(), locationOf(player()));
    teleport(asEntity(ctx.attacker()), locationOf(player()));
    return [];
  });
  onHttpResponse((ctx) => {
    // @ts-expect-error a Maybe status cannot fill a number parameter
    needsNum(ctx.httpStatus());
    needsNum(asNum(ctx.httpStatus()));
    // @ts-expect-error a Maybe body text cannot fill a text parameter
    needsText(ctx.httpBody());
    return [];
  });
}
void brandingTypeChecks;
