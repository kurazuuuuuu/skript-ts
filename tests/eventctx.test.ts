// Typed event contexts (feedback T2): the callback form of every
// event builder must produce exactly the same output as the
// array form written with the free accessor functions — the
// emitted .sk text and the IR are compared pairwise per builder
// (engine-only builders throw in the emitter in BOTH forms, so
// there the IR and the loc-stripped AST are compared instead).
// The type-level half of T2 (a damage ctx has no player, a Maybe
// attacker cannot fill a definite branded parameter, ...) is
// pinned by the @ts-expect-error checks in examples/eventctx.ts,
// which `pnpm typecheck` verifies.
import { describe, expect, it } from "vitest";
import {
  attacker,
  broadcast,
  cfError,
  cfId,
  cfR2Size,
  cfSignedUrl,
  chatMessage,
  clickedClickType,
  clickedEntity,
  clickedRawSlotIndex,
  clickedSlotIndex,
  damageAmount,
  damageCause,
  draggedSlots,
  droppedItemEntity,
  emit,
  eventBlock,
  eventCursor,
  eventEntity,
  eventFishingState,
  eventInventory,
  eventItem,
  every,
  fishingApproachAngle,
  fishingBiteTime,
  fishingHook,
  fishingWaitTime,
  fmt,
  guiEventId,
  hookedEntity,
  httpBody,
  httpError,
  httpId,
  httpSavedPath,
  httpStatus,
  itemOfEntity,
  onBedEnter,
  onBedLeave,
  onBlockBreak,
  onBlockPlace,
  onCfResponse,
  onChat,
  onConsume,
  onCraft,
  onDamage,
  onDeath,
  onDrop,
  onEntityDrop,
  onEntityHooked,
  onEntityPickup,
  onFirstJoin,
  onFishApproach,
  onFishBite,
  onFishCast,
  onFishCaught,
  onFishEscape,
  onFishReelIn,
  onFishingStateChange,
  onHookInGround,
  onHttpResponse,
  onInventoryClick,
  onInventoryClose,
  onInventoryDrag,
  onJoin,
  onLeftClick,
  onPickup,
  onPlaceholderRequest,
  onProjectileHit,
  onQuit,
  onResourcePackStatus,
  onRespawn,
  onRightClick,
  onSwapHand,
  onTimerComplete,
  onTimerTick,
  onToggleSneak,
  onWsClose,
  onWsMessage,
  onWsOpen,
  placeholderIdentifier,
  placeholderPrefix,
  player,
  resourcePackStatus,
  script,
  send,
  str,
  timerId,
  toIr,
  victim,
  wsId,
  wsMessage,
} from "../src/index.js";
import type { Stmt, TopLevel } from "../src/index.js";

/** Strip call-site locations so two separately built trees compare by shape alone. */
function stripped(top: TopLevel): unknown {
  return JSON.parse(
    JSON.stringify(top, (key, value: unknown) => (key === "loc" ? undefined : value)),
  );
}

function pair(name: string, arrayForm: TopLevel, callbackForm: TopLevel, engineOnly = false): void {
  it(name, () => {
    const a = script(arrayForm);
    const b = script(callbackForm);
    expect(stripped(callbackForm)).toEqual(stripped(arrayForm));
    expect(toIr(b)).toEqual(toIr(a));
    if (engineOnly) {
      expect(() => emit(a)).toThrow();
      expect(() => emit(b)).toThrow();
    } else {
      expect(emit(b)).toBe(emit(a));
    }
  });
}

/** A one-statement body broadcasting the given expressions, for the array form. */
function say(...exprs: Parameters<typeof fmt>): Stmt[] {
  return [broadcast(fmt(...exprs))];
}

describe("typed event contexts: callback form ≡ array form", () => {
  pair(
    "onJoin",
    onJoin([send(player(), fmt("hi ", player()))]),
    onJoin((ctx) => [send(ctx.player(), fmt("hi ", ctx.player()))]),
  );
  pair(
    "onFirstJoin",
    onFirstJoin([broadcast(fmt("first ", player()))]),
    onFirstJoin((ctx) => [broadcast(fmt("first ", ctx.player()))]),
  );
  pair(
    "onQuit",
    onQuit([broadcast(fmt("bye ", player()))]),
    onQuit((ctx) => [broadcast(fmt("bye ", ctx.player()))]),
  );
  pair(
    "onChat",
    onChat(say("chat ", player(), ": ", chatMessage())),
    onChat((ctx) => say("chat ", ctx.player(), ": ", ctx.chatMessage())),
  );
  pair(
    "onDeath (with victim filter)",
    onDeath(say("died ", victim(), " by ", attacker()), { victim: "zombie" }),
    onDeath((ctx) => say("died ", ctx.victim(), " by ", ctx.attacker()), { victim: "zombie" }),
  );
  pair(
    "onBlockBreak (with block filter)",
    onBlockBreak(say("break ", player(), " ", eventBlock(), " ", eventItem()), { block: "stone" }),
    onBlockBreak(
      (ctx) => say("break ", ctx.player(), " ", ctx.eventBlock(), " ", ctx.eventItem()),
      {
        block: "stone",
      },
    ),
  );
  pair(
    "onBlockPlace",
    onBlockPlace(say("place ", player(), " ", eventBlock(), " ", eventItem())),
    onBlockPlace((ctx) => say("place ", ctx.player(), " ", ctx.eventBlock(), " ", ctx.eventItem())),
  );
  pair(
    "onRightClick (with filters)",
    onRightClick(say("rc ", player(), " ", eventBlock(), " ", eventItem(), " ", clickedEntity()), {
      entity: "villager",
      item: "stick",
    }),
    onRightClick(
      (ctx) =>
        say(
          "rc ",
          ctx.player(),
          " ",
          ctx.eventBlock(),
          " ",
          ctx.eventItem(),
          " ",
          ctx.clickedEntity(),
        ),
      { entity: "villager", item: "stick" },
    ),
  );
  pair(
    "onLeftClick",
    onLeftClick(say("lc ", player(), " ", eventBlock(), " ", eventItem())),
    onLeftClick((ctx) => say("lc ", ctx.player(), " ", ctx.eventBlock(), " ", ctx.eventItem())),
  );
  pair(
    "onDamage (with filters and priority)",
    onDamage(say("dmg ", victim(), " ", attacker(), " ", damageAmount(), " ", damageCause()), {
      victim: "player",
      attacker: "zombie",
      priority: "low",
    }),
    onDamage(
      (ctx) =>
        say(
          "dmg ",
          ctx.victim(),
          " ",
          ctx.attacker(),
          " ",
          ctx.damageAmount(),
          " ",
          ctx.damageCause(),
        ),
      { victim: "player", attacker: "zombie", priority: "low" },
    ),
  );
  pair(
    "onPickup (with item filter)",
    onPickup(say("pick ", player(), " ", eventItem()), { item: "wheat" }),
    onPickup((ctx) => say("pick ", ctx.player(), " ", ctx.eventItem()), { item: "wheat" }),
  );
  pair(
    "onDrop",
    onDrop(say("drop ", player(), " ", eventItem())),
    onDrop((ctx) => say("drop ", ctx.player(), " ", ctx.eventItem())),
  );
  pair(
    "onEntityPickup",
    onEntityPickup(say("epick ", eventEntity(), " ", player(), " ", eventItem())),
    onEntityPickup((ctx) =>
      say("epick ", ctx.eventEntity(), " ", ctx.player(), " ", ctx.eventItem()),
    ),
  );
  pair(
    "onEntityDrop",
    onEntityDrop(say("edrop ", eventEntity(), " ", droppedItemEntity(), " ", eventItem())),
    onEntityDrop((ctx) =>
      say("edrop ", ctx.eventEntity(), " ", ctx.droppedItemEntity(), " ", ctx.eventItem()),
    ),
  );
  pair(
    "onFishCast",
    onFishCast(say("cast ", player(), " ", fishingHook(), " ", eventFishingState())),
    onFishCast((ctx) =>
      say("cast ", ctx.player(), " ", ctx.fishingHook(), " ", ctx.eventFishingState()),
    ),
  );
  pair(
    "onFishApproach",
    onFishApproach(say("approach ", player(), " ", fishingHook())),
    onFishApproach((ctx) => say("approach ", ctx.player(), " ", ctx.fishingHook())),
  );
  pair(
    "onFishBite",
    onFishBite(say("bite ", player(), " ", fishingBiteTime())),
    onFishBite((ctx) => say("bite ", ctx.player(), " ", ctx.fishingBiteTime())),
  );
  pair(
    "onFishCaught",
    onFishCaught(
      say(
        "caught ",
        player(),
        " ",
        eventEntity(),
        " ",
        itemOfEntity(eventEntity()),
        " ",
        droppedItemEntity(),
      ),
    ),
    onFishCaught((ctx) =>
      say(
        "caught ",
        ctx.player(),
        " ",
        ctx.eventEntity(),
        " ",
        itemOfEntity(ctx.eventEntity()),
        " ",
        ctx.droppedItemEntity(),
      ),
    ),
  );
  pair(
    "onEntityHooked",
    onEntityHooked(say("hooked ", player(), " ", eventEntity(), " ", hookedEntity())),
    onEntityHooked((ctx) =>
      say("hooked ", ctx.player(), " ", ctx.eventEntity(), " ", ctx.hookedEntity()),
    ),
  );
  pair(
    "onHookInGround",
    onHookInGround(say("ground ", player(), " ", fishingHook())),
    onHookInGround((ctx) => say("ground ", ctx.player(), " ", ctx.fishingHook())),
  );
  pair(
    "onFishEscape",
    onFishEscape(say("escape ", player(), " ", eventFishingState())),
    onFishEscape((ctx) => say("escape ", ctx.player(), " ", ctx.eventFishingState())),
  );
  pair(
    "onFishReelIn",
    onFishReelIn(say("reel ", player(), " ", fishingHook())),
    onFishReelIn((ctx) => say("reel ", ctx.player(), " ", ctx.fishingHook())),
  );
  pair(
    "onFishingStateChange (with hook readings)",
    onFishingStateChange(
      say(
        "state ",
        player(),
        " ",
        eventFishingState(),
        " ",
        fishingWaitTime("min"),
        " ",
        fishingWaitTime("max"),
        " ",
        fishingApproachAngle("min"),
      ),
    ),
    onFishingStateChange((ctx) =>
      say(
        "state ",
        ctx.player(),
        " ",
        ctx.eventFishingState(),
        " ",
        ctx.fishingWaitTime("min"),
        " ",
        ctx.fishingWaitTime("max"),
        " ",
        ctx.fishingApproachAngle("min"),
      ),
    ),
  );
  pair(
    "onRespawn",
    onRespawn([send(player(), fmt("back ", player()))]),
    onRespawn((ctx) => [send(ctx.player(), fmt("back ", ctx.player()))]),
  );
  pair(
    "onBedEnter",
    onBedEnter(say("bed+ ", player(), " ", eventBlock())),
    onBedEnter((ctx) => say("bed+ ", ctx.player(), " ", ctx.eventBlock())),
  );
  pair(
    "onBedLeave",
    onBedLeave(say("bed- ", player(), " ", eventBlock())),
    onBedLeave((ctx) => say("bed- ", ctx.player(), " ", ctx.eventBlock())),
  );
  pair(
    "onConsume",
    onConsume(say("eat ", player(), " ", eventItem())),
    onConsume((ctx) => say("eat ", ctx.player(), " ", ctx.eventItem())),
  );
  pair(
    "onCraft",
    onCraft(say("craft ", player(), " ", eventItem(), " ", eventInventory())),
    onCraft((ctx) => say("craft ", ctx.player(), " ", ctx.eventItem(), " ", ctx.eventInventory())),
  );
  pair(
    "onProjectileHit",
    onProjectileHit(say("hit ", attacker(), " ", victim(), " ", eventBlock())),
    onProjectileHit((ctx) => say("hit ", ctx.attacker(), " ", ctx.victim(), " ", ctx.eventBlock())),
  );
  pair(
    "onToggleSneak",
    onToggleSneak([broadcast(fmt("sneak ", player()))]),
    onToggleSneak((ctx) => [broadcast(fmt("sneak ", ctx.player()))]),
  );
  pair(
    "onSwapHand (engine-only)",
    onSwapHand(say("swap ", player(), " ", eventItem())),
    onSwapHand((ctx) => say("swap ", ctx.player(), " ", ctx.eventItem())),
    true,
  );
  pair(
    "onInventoryClick",
    onInventoryClick(
      say(
        "click ",
        player(),
        " ",
        eventItem(),
        " ",
        eventInventory(),
        " ",
        clickedSlotIndex(),
        " ",
        clickedRawSlotIndex(),
        " ",
        clickedClickType(),
      ),
    ),
    onInventoryClick((ctx) =>
      say(
        "click ",
        ctx.player(),
        " ",
        ctx.eventItem(),
        " ",
        ctx.eventInventory(),
        " ",
        ctx.clickedSlotIndex(),
        " ",
        ctx.clickedRawSlotIndex(),
        " ",
        ctx.clickedClickType(),
      ),
    ),
  );
  pair(
    "onInventoryClick cursor / GUI id (engine-only)",
    onInventoryClick(say("cursor ", eventCursor(), " ", guiEventId())),
    onInventoryClick((ctx) => say("cursor ", ctx.eventCursor(), " ", ctx.guiEventId())),
    true,
  );
  pair(
    "onInventoryClose",
    onInventoryClose(say("close ", player(), " ", eventInventory())),
    onInventoryClose((ctx) => say("close ", ctx.player(), " ", ctx.eventInventory())),
  );
  pair(
    "onInventoryDrag",
    onInventoryDrag(
      say("drag ", player(), " ", eventInventory(), " ", eventItem(), " ", draggedSlots()),
    ),
    onInventoryDrag((ctx) =>
      say(
        "drag ",
        ctx.player(),
        " ",
        ctx.eventInventory(),
        " ",
        ctx.eventItem(),
        " ",
        ctx.draggedSlots(),
      ),
    ),
  );
  pair(
    "onInventoryDrag cursor (engine-only)",
    onInventoryDrag(say("dcursor ", eventCursor())),
    onInventoryDrag((ctx) => say("dcursor ", ctx.eventCursor())),
    true,
  );
  pair(
    "onWsOpen (engine-only)",
    onWsOpen(say("wsopen ", wsId())),
    onWsOpen((ctx) => say("wsopen ", ctx.wsId())),
    true,
  );
  pair(
    "onWsMessage (engine-only)",
    onWsMessage(say("wsmsg ", wsId(), " ", wsMessage())),
    onWsMessage((ctx) => say("wsmsg ", ctx.wsId(), " ", ctx.wsMessage())),
    true,
  );
  pair(
    "onWsClose (engine-only)",
    onWsClose(say("wsclose ", wsId())),
    onWsClose((ctx) => say("wsclose ", ctx.wsId())),
    true,
  );
  pair(
    "onTimerTick (engine-only)",
    onTimerTick(say("tick ", timerId())),
    onTimerTick((ctx) => say("tick ", ctx.timerId())),
    true,
  );
  pair(
    "onTimerComplete (engine-only)",
    onTimerComplete(say("done ", timerId())),
    onTimerComplete((ctx) => say("done ", ctx.timerId())),
    true,
  );
  pair(
    "onPlaceholderRequest (engine-only)",
    onPlaceholderRequest(
      "test",
      say("papi ", player(), " ", placeholderIdentifier(), " ", placeholderPrefix()),
    ),
    onPlaceholderRequest("test", (ctx) =>
      say("papi ", ctx.player(), " ", ctx.placeholderIdentifier(), " ", ctx.placeholderPrefix()),
    ),
    true,
  );
  pair(
    "onHttpResponse (engine-only)",
    onHttpResponse(
      say(
        "http ",
        httpId(),
        " ",
        httpStatus(),
        " ",
        httpBody(),
        " ",
        httpError(),
        " ",
        httpSavedPath(),
      ),
    ),
    onHttpResponse((ctx) =>
      say(
        "http ",
        ctx.httpId(),
        " ",
        ctx.httpStatus(),
        " ",
        ctx.httpBody(),
        " ",
        ctx.httpError(),
        " ",
        ctx.httpSavedPath(),
      ),
    ),
    true,
  );
  pair(
    "onCfResponse (engine-only)",
    onCfResponse(say("cf ", cfId(), " ", cfError(), " ", cfSignedUrl(), " ", cfR2Size())),
    onCfResponse((ctx) =>
      say("cf ", ctx.cfId(), " ", ctx.cfError(), " ", ctx.cfSignedUrl(), " ", ctx.cfR2Size()),
    ),
    true,
  );
  pair(
    "onResourcePackStatus (engine-only)",
    onResourcePackStatus(say("pack ", player(), " ", resourcePackStatus())),
    onResourcePackStatus((ctx) => say("pack ", ctx.player(), " ", ctx.resourcePackStatus())),
    true,
  );
  pair(
    "every (periodical, empty context)",
    every(5, "seconds", [broadcast(str("tick"))]),
    every(5, "seconds", () => [broadcast(str("tick"))]),
  );
});
