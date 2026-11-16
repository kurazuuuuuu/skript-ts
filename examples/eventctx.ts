import {
  asBlock,
  asEntity,
  broadcast,
  defineFn,
  fmt,
  ifElse,
  isSet,
  num,
  onBlockBreak,
  onChat,
  onDamage,
  onDeath,
  onEntityPickup,
  onFishCaught,
  onJoin,
  onLeftClick,
  onProjectileHit,
  onRightClick,
  param,
  returnValue,
  script,
  send,
  setDamage,
} from "../src/index.js";
import type { Script } from "../src/index.js";

// Typed event contexts (feedback T2): every handler below uses
// the callback form of its event builder. The ctx parameter
// carries only the context values that exist in that event, and
// the values that may be absent in a firing (an environmental
// damage event's attacker, an air click's block) come back as
// Maybe-branded expressions: they compose with generic
// expression positions and isSet() directly, but a definite
// branded slot needs an explicit asEntity / asBlock assertion.
// The emitted .sk for this script is exactly what the same
// handlers written in the array form with the free accessor
// functions would emit — tests/eventctx.test.ts pins that.

export const eventCtxScript: Script = script(
  onJoin((ctx) => [send(ctx.player(), fmt("おかえりなさい、", ctx.player(), " さん"))]),
  onChat((ctx) => [broadcast(fmt("[CHAT] ", ctx.player(), ": ", ctx.chatMessage()))]),
  onDamage((ctx) => [
    // There is no ctx.player here — damage events have no player.
    // The attacker may be absent (fall, lava, ...), so the
    // report branches on isSet; the victim always exists.
    ifElse(isSet(ctx.attacker()), [
      send(
        ctx.victim(),
        fmt("damage ", ctx.damageAmount(), " (", ctx.damageCause(), ") by ", ctx.attacker()),
      ),
    ]),
    setDamage(ctx.damageAmount()),
  ]),
  onDeath((ctx) => [
    ifElse(isSet(ctx.attacker()), [
      broadcast(fmt("", ctx.victim(), " was slain by ", ctx.attacker())),
    ]),
  ]),
  onBlockBreak((ctx) => [
    send(ctx.player(), fmt("broke ", ctx.eventBlock(), " with ", ctx.eventItem())),
  ]),
  onRightClick((ctx) => [
    ifElse(isSet(ctx.clickedEntity()), [
      send(ctx.player(), fmt("clicked entity ", asEntity(ctx.clickedEntity()))),
    ]),
    ifElse(isSet(ctx.eventBlock()), [
      send(ctx.player(), fmt("clicked block ", asBlock(ctx.eventBlock()))),
    ]),
  ]),
);

// Compile-time negative checks for the context types. This
// function is never called and is not part of eventCtxScript, so
// the calls below emit nothing into any script; `pnpm typecheck`
// (which compiles the examples) is what verifies them — each
// suppression directive below fails the typecheck if the line it
// sits on ever becomes valid TypeScript.
function eventCtxTypeChecks(): void {
  const needsEntity = defineFn("ctxNeedsEntity", [param("who", "entity")], "number", [
    returnValue(num(1)),
  ]);
  const needsPlayer = defineFn("ctxNeedsPlayer", [param("who", "player")], "number", [
    returnValue(num(1)),
  ]);
  const needsBlock = defineFn("ctxNeedsBlock", [param("what", "block")], "number", [
    returnValue(num(1)),
  ]);

  onDamage((ctx) => {
    // @ts-expect-error damage events have no player
    ctx.player();
    // @ts-expect-error a Maybe attacker cannot fill a definite entity parameter
    needsEntity(ctx.attacker());
    // @ts-expect-error a Maybe attacker cannot fill a player parameter either
    needsPlayer(ctx.attacker());
    // The definite victim fills entity parameters, and the Maybe
    // attacker does after an explicit assertion.
    needsEntity(ctx.victim());
    needsEntity(asEntity(ctx.attacker()));
    return [];
  });
  onDeath((ctx) => {
    // @ts-expect-error death events have no player
    ctx.player();
    return [];
  });
  onLeftClick((ctx) => {
    // @ts-expect-error left clicks have no clicked entity (an entity click is a damage event)
    ctx.clickedEntity();
    return [];
  });
  onRightClick((ctx) => {
    // @ts-expect-error a Maybe block cannot fill a definite block parameter
    needsBlock(ctx.eventBlock());
    needsBlock(asBlock(ctx.eventBlock()));
    return [];
  });
  onEntityPickup((ctx) => {
    // @ts-expect-error the picker may be a mob, so its player is a Maybe
    needsPlayer(ctx.player());
    return [];
  });
  onProjectileHit((ctx) => {
    // @ts-expect-error projectile hits have no player value
    ctx.player();
    // @ts-expect-error the hit entity is a Maybe (a block hit has none)
    needsEntity(ctx.victim());
    return [];
  });
  onFishCaught((ctx) => {
    // @ts-expect-error fishing events have no event-item
    ctx.eventItem();
    return [];
  });
  onJoin((ctx) => {
    // @ts-expect-error join events have no victim
    ctx.victim();
    return [];
  });
}
void eventCtxTypeChecks;
