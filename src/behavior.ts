import { createBot, type Bot } from "mineflayer";

/**
 * Behavior tests verify what emitted Skript scripts actually DO on a
 * live server, beyond loading without errors. A behavior test is a
 * TypeScript module (conventionally `behavior/<name>.behavior.ts`)
 * whose default export is a function taking a BehaviorContext:
 *
 * ```ts
 * import { defineBehavior } from "../../src/behavior.js";
 * export default defineBehavior(async (t) => {
 *   const bot = await t.connect("SkriptBot");
 *   await bot.waitForMessage(/ようこそ/);
 *   bot.disconnect();
 * });
 * ```
 */

export interface BehaviorBot {
  readonly username: string;
  /** Recent plain-text chat/system messages received by the bot (color codes stripped). */
  readonly messages: readonly string[];
  /**
   * Resolve with the first buffered or future message matching the
   * pattern. Throws on timeout, listing the messages seen recently.
   */
  waitForMessage(pattern: RegExp | string, timeoutMs?: number): Promise<string>;
  /** Send a chat message or a `/command`. */
  chat(text: string): void;
  /** Poll the bot's inventory until an item with this name appears. Throws on timeout. */
  expectInventoryItem(itemName: string, timeoutMs?: number): Promise<void>;
  disconnect(): void;
  // World interaction controls (phase 14): enough of the bot's
  // body to exercise the gameplay events — digging, placing,
  // clicking and fighting — against the live server.
  /** Current position; block coordinates are the floor of these. */
  position(): { x: number; y: number; z: number };
  /** Minecraft name of the block at the coordinates ("grass_block"), or null for air / not loaded. */
  blockNameAt(x: number, y: number, z: number): string | null;
  /** Dig the block at the coordinates until it breaks. */
  digAt(x: number, y: number, z: number): Promise<void>;
  /** Stop an in-progress dig (e.g. one the server keeps cancelling). */
  stopDigging(): void;
  /** Equip the named inventory item in the main hand. Throws on timeout. */
  equipItem(itemName: string, timeoutMs?: number): Promise<void>;
  /** Place the held block on top of the block at the coordinates. */
  placeOnTopOf(x: number, y: number, z: number): Promise<void>;
  /** Right-click the block at the coordinates with the held item (or empty hand). */
  activateBlockAt(x: number, y: number, z: number): Promise<void>;
  /** Attack the named player once. */
  attackPlayer(username: string): Promise<void>;
  /** Current health (20 is full). */
  health(): number;
  // Phase 19 controls: player state reads and sound / entity
  // observation — enough to exercise the state expressions and
  // the spawn / drop / play-sound effects.
  /** Current food level in points (20 is full; half of the script's drumstick value ×2). */
  food(): number;
  /** Current saturation (unscaled, as the script reads it). */
  saturation(): number;
  /** Current game mode as its name ("survival", "creative", ...). */
  gameMode(): string;
  /** Current experience level. (Total points are NOT exposed: the client's points value mirrors a stale server field under script manipulation, so tests assert totals through script readbacks instead.) */
  xpLevel(): number;
  /** How many visible entities with this Minecraft name (e.g. "zombie") the bot currently sees. */
  countEntities(entityName: string): number;
  /** Sound-effect packets the bot has received, oldest first (positions in block coordinates). */
  soundPackets(): readonly SoundPacket[];
  /** Poll until a sound-effect packet arrives near the point, considering only packets from index `fromIndex` of soundPackets() on (snapshot it before triggering the sound). Throws on timeout. */
  waitForSoundNear(
    x: number,
    y: number,
    z: number,
    radius?: number,
    timeoutMs?: number,
    fromIndex?: number,
  ): Promise<SoundPacket>;
  // Phase 16 controls: entity interaction, item tossing and
  // sleeping — enough to exercise the pickup / drop / bed events.
  /** Right-click the nearest visible entity with this Minecraft name (e.g. "villager"). */
  activateEntityByName(entityName: string, timeoutMs?: number): Promise<void>;
  /** Toss one stack of the named inventory item onto the ground (a player drop). */
  tossItem(itemName: string): Promise<void>;
  /** Poll until no inventory item with this name remains. Throws on timeout. */
  expectNoInventoryItem(itemName: string, timeoutMs?: number): Promise<void>;
  /** Sleep in the bed block at the coordinates. */
  sleepAt(x: number, y: number, z: number): Promise<void>;
  /** Get out of bed. */
  wake(): Promise<void>;
  /** Close an open container window (e.g. a villager's trade screen after a right click), if any. */
  closeWindow(): void;
  // Phase 17 controls: inventory windows — enough to exercise
  // the GUI statements and the inventory click / close events.
  /** Poll until a container window is open (optionally with a title containing the text). Throws on timeout. */
  waitForWindow(titlePart?: string, timeoutMs?: number): Promise<void>;
  /** The open window's title as raw text (a JSON chat component string), or null when no container is open. */
  windowTitle(): string | null;
  /** The item in a window slot, or null for an empty slot / no window. */
  windowSlotItem(slot: number): WindowSlotItem | null;
  /** Click a window slot (raw window index: top inventory first, then the player's own inventory). Left-click by default; `button` 1 is a right click. */
  clickWindowSlot(slot: number, button?: number): Promise<void>;
  // Phase 28 controls: the cursor item and drag clicks.
  /** The item on the cursor (the carried item), or null when the cursor is empty. */
  cursorItem(): WindowSlotItem | null;
  /** Drag the carried item across the given raw window slots in order (a left or right drag). */
  dragWindowSlots(slots: number[], side: "left" | "right"): Promise<void>;
  // Phase 21 controls: display packets — enough to exercise
  // the title / action bar / boss bar effects by what the
  // client actually received, not by script readbacks alone.
  /** Plain texts of the set_title_text packets received, oldest first. */
  titleTexts(): readonly string[];
  /** Plain texts of the set_title_subtitle packets received, oldest first. */
  titleSubtitles(): readonly string[];
  /** The set_title_time packets received, oldest first (ticks). */
  titleTimes(): readonly TitleTimePacket[];
  /** The reset flags of the clear_titles packets received, oldest first (false = clear, true = reset). */
  titleClears(): readonly boolean[];
  /** Plain texts of the action_bar packets received, oldest first. */
  actionBarTexts(): readonly string[];
  /** The boss_bar packets received, oldest first. */
  bossBarPackets(): readonly BossBarPacket[];
  /** Poll until a title text packet with exactly this plain text arrives, considering only packets from index `fromIndex` of titleTexts() on. Throws on timeout. */
  waitForTitleText(text: string, timeoutMs?: number, fromIndex?: number): Promise<void>;
  /** Poll until a title times packet with exactly these tick values arrives, considering only packets from index `fromIndex` of titleTimes() on. Throws on timeout. */
  waitForTitleTimes(
    fadeIn: number,
    stay: number,
    fadeOut: number,
    timeoutMs?: number,
    fromIndex?: number,
  ): Promise<void>;
  /** Poll until a clear_titles packet with this reset flag arrives, considering only packets from index `fromIndex` of titleClears() on. Throws on timeout. */
  waitForTitleClear(reset: boolean, timeoutMs?: number, fromIndex?: number): Promise<void>;
  /** Poll until an action bar packet with exactly this plain text arrives, considering only packets from index `fromIndex` of actionBarTexts() on. Throws on timeout. */
  waitForActionBarText(text: string, timeoutMs?: number, fromIndex?: number): Promise<void>;
  /** Poll until a boss_bar packet with this action arrives, considering only packets from index `fromIndex` of bossBarPackets() on; resolves with the packet. Throws on timeout. */
  waitForBossBarAction(
    action: number,
    timeoutMs?: number,
    fromIndex?: number,
  ): Promise<BossBarPacket>;
  // Phase 22 controls: fishing and generic entity combat —
  // enough to exercise the fishing sub-events (cast / bite /
  // catch / escape / reel by hand) and a mob kill for the
  // generalized death event.
  /** Look at the given world point (the fishing casts aim this way). */
  lookAtPoint(x: number, y: number, z: number): Promise<void>;
  /** Start using the held item (casts a fishing rod). */
  activateItem(): void;
  /** Stop using the held item. */
  deactivateItem(): void;
  /** Cast and fish until a catch is reeled in (mineflayer's full cast → bite → reel cycle). Throws on timeout; on timeout the line is reeled in to reset. */
  fishOnce(timeoutMs?: number): Promise<void>;
  /** Attack the nearest visible entity with this Minecraft name (e.g. "zombie") once. */
  attackEntityByName(entityName: string, timeoutMs?: number): Promise<void>;
}

/**
 * A sound-effect packet the bot received (phase 19). `soundId`
 * is the registry id when the server sent one (the original's
 * play-sound form does); `soundName` is set for direct-name
 * packets (e.g. the vanilla /playsound command). Client-side
 * name mapping of registry ids is version-sensitive, so tests
 * assert on the packet's arrival, position and volume rather
 * than on a decoded name.
 */
export interface SoundPacket {
  soundId: number | null;
  soundName: string | null;
  volume: number;
  pitch: number;
  x: number;
  y: number;
  z: number;
}

/** An item seen in a window slot (phase 17): its Minecraft name, stack count, and custom meta text. */
export interface WindowSlotItem {
  name: string;
  count: number;
  /** The custom display name, when the item carries one. */
  customName: string | null;
  /** The lore lines, when the item carries lore. */
  lore: string[];
}

/** A set_title_time packet the bot received (phase 21), in ticks. */
export interface TitleTimePacket {
  fadeIn: number;
  stay: number;
  fadeOut: number;
}

/**
 * A boss_bar packet the bot received (phase 21). `action` is
 * the protocol action: 0 add, 1 remove, 2 update health, 3
 * update title, 4 update style, 5 update flags. Fields a
 * packet does not carry are null. `title` is the plain text of
 * the title component; `color` is the protocol color enum
 * (pink 0, blue 1, red 2, green 3, yellow 4, purple 5,
 * white 6); `dividers` is the protocol style enum (solid 0,
 * 6 notches 1, 10 notches 2, 12 notches 3, 20 notches 4).
 */
export interface BossBarPacket {
  action: number;
  title: string | null;
  health: number | null;
  color: number | null;
  dividers: number | null;
}

export interface BehaviorContext {
  /**
   * Which runtime the sandbox is running: "skript" (the real Skript
   * plugin executing emitted .sk files) or "engine" (the skript-ts
   * engine jar executing IR). Tests for engine-builtin features check
   * this and only exercise the feature under the engine.
   */
  readonly mode: "skript" | "engine";
  /** Connect a bot with the given offline-mode username and wait until it has spawned. */
  connect(username: string): Promise<BehaviorBot>;
  /** Run a command on the server console (e.g. `op SomeBot`). Resolves after a short settle delay. */
  console(command: string): Promise<void>;
  sleep(ms: number): Promise<void>;
}

export type BehaviorTest = (t: BehaviorContext) => Promise<void>;

/** Identity helper that gives behavior test modules a typed default export. */
export function defineBehavior(fn: BehaviorTest): BehaviorTest {
  return fn;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function stripColor(s: string): string {
  return s.replace(/§[0-9a-fk-orx]/gi, "");
}

/** The raw sound_effect packet shape on the wire (phase 19): the sound is a holder (registry id or a direct name) and the position is fixed-point (×8). */
interface RawSoundPacket {
  sound?: { soundId?: number; data?: { soundName?: string } };
  x?: number;
  y?: number;
  z?: number;
  volume?: number;
  pitch?: number;
}

/** The raw display packet shapes on the wire (phase 21): text fields are chat components in NBT form. */
interface RawTextPacket {
  text?: unknown;
}
interface RawTitleTimePacket {
  fadeIn?: number;
  stay?: number;
  fadeOut?: number;
}
interface RawClearTitlesPacket {
  reset?: boolean;
}
interface RawBossBarPacket {
  action?: number;
  title?: unknown;
  health?: number;
  color?: number;
  dividers?: number;
}

/**
 * Flatten a chat component (phase 21) to its plain text.
 * Components arrive as prismarine-nbt nodes ({type:'string'},
 * {type:'compound'}, {type:'list'}), as plain JSON components
 * ({text, extra}), or occasionally as a JSON string; color and
 * style fields are dropped — display tests assert on text and
 * on the packet fields, not on styling.
 */
function componentPlainText(v: unknown): string {
  if (typeof v === "string") {
    if (v.startsWith("{") || v.startsWith("[")) {
      try {
        return componentPlainText(JSON.parse(v) as unknown);
      } catch {
        return v;
      }
    }
    return v;
  }
  if (v === null || typeof v !== "object") return "";
  const rec = v as Record<string, unknown>;
  if (rec.type === "string" && typeof rec.value === "string") return rec.value;
  if (rec.type === "list") {
    const val = rec.value as { value?: unknown[] } | undefined;
    return (val?.value ?? []).map(componentPlainText).join("");
  }
  if (rec.type === "compound" && rec.value !== null && typeof rec.value === "object") {
    return componentPlainText(rec.value);
  }
  let out = "";
  if (typeof rec.text === "string") out += rec.text;
  else if (rec.text !== undefined) out += componentPlainText(rec.text);
  if (Array.isArray(rec.extra)) out += rec.extra.map(componentPlainText).join("");
  else if (rec.extra !== undefined) out += componentPlainText(rec.extra);
  return out;
}

class MineflayerBehaviorBot implements BehaviorBot {
  readonly messages: string[] = [];
  private readonly sounds: SoundPacket[] = [];
  private readonly titleTextLog: string[] = [];
  private readonly titleSubtitleLog: string[] = [];
  private readonly titleTimeLog: TitleTimePacket[] = [];
  private readonly titleClearLog: boolean[] = [];
  private readonly actionBarLog: string[] = [];
  private readonly bossBarLog: BossBarPacket[] = [];
  private readonly waiters: {
    pattern: RegExp | string;
    resolve: (msg: string) => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout;
  }[] = [];
  private failure: Error | null = null;

  constructor(private readonly bot: Bot) {
    // Raw sound packets (phase 19): the high-level
    // soundEffectHeard event drops packets whose registry id
    // the client's data tables cannot name, so capture the wire
    // form directly.
    const client = (
      this.bot as unknown as {
        _client: { on(ev: string, fn: (p: RawSoundPacket) => void): void };
      }
    )._client;
    client.on("sound_effect", (p) => {
      this.sounds.push({
        soundId: typeof p.sound?.soundId === "number" ? p.sound.soundId : null,
        soundName: typeof p.sound?.data?.soundName === "string" ? p.sound.data.soundName : null,
        volume: p.volume ?? 0,
        pitch: p.pitch ?? 0,
        x: (p.x ?? 0) / 8,
        y: (p.y ?? 0) / 8,
        z: (p.z ?? 0) / 8,
      });
    });
    // Raw display packets (phase 21): titles, the action bar
    // and boss bars have no high-level mineflayer events, so
    // capture the wire forms directly, like the sound packets.
    const displayClient = (
      this.bot as unknown as {
        _client: { on<T>(ev: string, fn: (p: T) => void): void };
      }
    )._client;
    displayClient.on<RawTextPacket>("set_title_text", (p) => {
      this.titleTextLog.push(componentPlainText(p.text));
    });
    displayClient.on<RawTextPacket>("set_title_subtitle", (p) => {
      this.titleSubtitleLog.push(componentPlainText(p.text));
    });
    displayClient.on<RawTitleTimePacket>("set_title_time", (p) => {
      this.titleTimeLog.push({
        fadeIn: p.fadeIn ?? -1,
        stay: p.stay ?? -1,
        fadeOut: p.fadeOut ?? -1,
      });
    });
    displayClient.on<RawClearTitlesPacket>("clear_titles", (p) => {
      this.titleClearLog.push(p.reset === true);
    });
    displayClient.on<RawTextPacket>("action_bar", (p) => {
      this.actionBarLog.push(componentPlainText(p.text));
    });
    displayClient.on<RawBossBarPacket>("boss_bar", (p) => {
      this.bossBarLog.push({
        action: p.action ?? -1,
        title: p.title !== undefined ? componentPlainText(p.title) : null,
        health: typeof p.health === "number" ? p.health : null,
        color: typeof p.color === "number" ? p.color : null,
        dividers: typeof p.dividers === "number" ? p.dividers : null,
      });
    });
    this.bot.on("messagestr", (raw) => {
      const msg = stripColor(raw);
      this.messages.push(msg);
      // Retention must far exceed any test's message volume:
      // behavior tests delimit expectations by INDEX into this
      // array ("marks"), and dropping entries from the front
      // silently invalidates every outstanding mark — with the
      // old 200 cap, ambient broadcast spam (the sandbox's mobs
      // hurting each other, reported by the damage sample) filled
      // the buffer mid-test and later waits timed out on messages
      // that had in fact arrived (phase 16, events2 pickup).
      if (this.messages.length > 100_000) this.messages.shift();
      for (const w of this.waiters.slice()) {
        const hit = typeof w.pattern === "string" ? msg.includes(w.pattern) : w.pattern.test(msg);
        if (hit) {
          this.waiters.splice(this.waiters.indexOf(w), 1);
          clearTimeout(w.timer);
          w.resolve(msg);
        }
      }
    });
    this.bot.on("kicked", (reason) => {
      this.setFailure(new Error(`bot was kicked: ${String(reason)}`));
    });
    this.bot.on("error", (err) => {
      this.setFailure(err instanceof Error ? err : new Error(String(err)));
    });
    this.bot.on("end", () => {
      this.setFailure(new Error("bot connection ended"));
    });
  }

  get username(): string {
    return this.bot.username;
  }

  private setFailure(err: Error): void {
    if (this.failure === null) this.failure = err;
    for (const w of this.waiters.splice(0)) {
      clearTimeout(w.timer);
      w.reject(this.failure);
    }
  }

  waitForMessage(pattern: RegExp | string, timeoutMs = 20_000): Promise<string> {
    for (const msg of this.messages) {
      const hit = typeof pattern === "string" ? msg.includes(pattern) : pattern.test(msg);
      if (hit) return Promise.resolve(msg);
    }
    if (this.failure !== null) return Promise.reject(this.failure);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.findIndex((w) => w.timer === timer);
        if (idx >= 0) this.waiters.splice(idx, 1);
        const recent = this.messages.slice(-10).join(" | ") || "(none)";
        reject(
          new Error(
            `timed out after ${timeoutMs}ms waiting for message ${String(pattern)}; recent messages: ${recent}`,
          ),
        );
      }, timeoutMs);
      timer.unref();
      this.waiters.push({ pattern, resolve, reject, timer });
    });
  }

  chat(text: string): void {
    this.bot.chat(text);
  }

  async expectInventoryItem(itemName: string, timeoutMs = 10_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const items = this.bot.inventory?.items() ?? [];
      if (items.some((it) => it.name === itemName)) return;
      if (Date.now() >= deadline) {
        const names = items.map((it) => `${it.name} x${it.count}`).join(", ") || "(empty)";
        throw new Error(
          `timed out after ${timeoutMs}ms waiting for inventory item "${itemName}"; inventory: ${names}`,
        );
      }
      await sleep(250);
    }
  }

  disconnect(): void {
    try {
      this.bot.quit();
    } catch {
      // already gone
    }
    try {
      this.bot.end();
    } catch {
      // already gone
    }
  }

  position(): { x: number; y: number; z: number } {
    const p = this.bot.entity.position;
    return { x: p.x, y: p.y, z: p.z };
  }

  /** The mineflayer block at absolute coordinates, or null when not loaded. */
  private blockAt(x: number, y: number, z: number) {
    return this.bot.blockAt(this.bot.entity.position.clone().set(x, y, z));
  }

  blockNameAt(x: number, y: number, z: number): string | null {
    const block = this.blockAt(x, y, z);
    if (block === null || block.name === "air") return null;
    return block.name;
  }

  async digAt(x: number, y: number, z: number): Promise<void> {
    const block = this.blockAt(x, y, z);
    if (block === null || block.name === "air") {
      throw new Error(`no diggable block at ${x}, ${y}, ${z}`);
    }
    await this.bot.dig(block);
  }

  stopDigging(): void {
    this.bot.stopDigging();
  }

  async equipItem(itemName: string, timeoutMs = 10_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const found = (this.bot.inventory?.items() ?? []).find((it) => it.name === itemName);
      if (found !== undefined) {
        await this.bot.equip(found, "hand");
        return;
      }
      if (Date.now() >= deadline) {
        const names =
          (this.bot.inventory?.items() ?? []).map((it) => it.name).join(", ") || "(empty)";
        throw new Error(
          `timed out after ${timeoutMs}ms waiting to equip "${itemName}"; inventory: ${names}`,
        );
      }
      await sleep(250);
    }
  }

  async placeOnTopOf(x: number, y: number, z: number): Promise<void> {
    const reference = this.blockAt(x, y, z);
    if (reference === null) {
      throw new Error(`no reference block at ${x}, ${y}, ${z} to place on`);
    }
    await this.bot.placeBlock(reference, this.bot.entity.position.clone().set(0, 1, 0));
  }

  async activateBlockAt(x: number, y: number, z: number): Promise<void> {
    const block = this.blockAt(x, y, z);
    if (block === null) {
      throw new Error(`no block at ${x}, ${y}, ${z} to activate`);
    }
    await this.bot.activateBlock(block);
  }

  async attackPlayer(username: string): Promise<void> {
    const entity = Object.values(this.bot.entities).find((e) => e.username === username);
    if (entity === undefined) {
      throw new Error(`player "${username}" is not visible to bot "${this.username}"`);
    }
    this.bot.attack(entity);
  }

  health(): number {
    return this.bot.health;
  }

  food(): number {
    return this.bot.food;
  }

  saturation(): number {
    return this.bot.foodSaturation;
  }

  gameMode(): string {
    return this.bot.game.gameMode;
  }

  xpLevel(): number {
    return this.bot.experience.level;
  }

  countEntities(entityName: string): number {
    return Object.values(this.bot.entities).filter((e) => e.name === entityName).length;
  }

  soundPackets(): readonly SoundPacket[] {
    return this.sounds;
  }

  async waitForSoundNear(
    x: number,
    y: number,
    z: number,
    radius = 3,
    timeoutMs = 10_000,
    fromIndex = 0,
  ): Promise<SoundPacket> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const hit = this.sounds
        .slice(fromIndex)
        .find(
          (s) =>
            Math.abs(s.x - x) <= radius &&
            Math.abs(s.y - y) <= radius &&
            Math.abs(s.z - z) <= radius,
        );
      if (hit !== undefined) return hit;
      if (Date.now() >= deadline) {
        throw new Error(
          `timed out after ${timeoutMs}ms waiting for a sound near ${x}, ${y}, ${z}; heard ${this.sounds.length} packets`,
        );
      }
      await sleep(150);
    }
  }

  titleTexts(): readonly string[] {
    return this.titleTextLog;
  }

  titleSubtitles(): readonly string[] {
    return this.titleSubtitleLog;
  }

  titleTimes(): readonly TitleTimePacket[] {
    return this.titleTimeLog;
  }

  titleClears(): readonly boolean[] {
    return this.titleClearLog;
  }

  actionBarTexts(): readonly string[] {
    return this.actionBarLog;
  }

  bossBarPackets(): readonly BossBarPacket[] {
    return this.bossBarLog;
  }

  async waitForTitleText(text: string, timeoutMs = 10_000, fromIndex = 0): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (this.titleTextLog.slice(fromIndex).includes(text)) return;
      if (Date.now() >= deadline) {
        throw new Error(
          `timed out after ${timeoutMs}ms waiting for title text "${text}"; saw ${JSON.stringify(this.titleTextLog)}`,
        );
      }
      await sleep(150);
    }
  }

  async waitForTitleTimes(
    fadeIn: number,
    stay: number,
    fadeOut: number,
    timeoutMs = 10_000,
    fromIndex = 0,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const hit = this.titleTimeLog
        .slice(fromIndex)
        .find((t) => t.fadeIn === fadeIn && t.stay === stay && t.fadeOut === fadeOut);
      if (hit !== undefined) return;
      if (Date.now() >= deadline) {
        throw new Error(
          `timed out after ${timeoutMs}ms waiting for title times ${fadeIn}/${stay}/${fadeOut}; saw ${JSON.stringify(this.titleTimeLog)}`,
        );
      }
      await sleep(150);
    }
  }

  async waitForTitleClear(reset: boolean, timeoutMs = 10_000, fromIndex = 0): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (this.titleClearLog.slice(fromIndex).includes(reset)) return;
      if (Date.now() >= deadline) {
        throw new Error(
          `timed out after ${timeoutMs}ms waiting for a title clear (reset=${reset}); saw ${JSON.stringify(this.titleClearLog)}`,
        );
      }
      await sleep(150);
    }
  }

  async waitForActionBarText(text: string, timeoutMs = 10_000, fromIndex = 0): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (this.actionBarLog.slice(fromIndex).includes(text)) return;
      if (Date.now() >= deadline) {
        throw new Error(
          `timed out after ${timeoutMs}ms waiting for action bar text "${text}"; saw ${JSON.stringify(this.actionBarLog)}`,
        );
      }
      await sleep(150);
    }
  }

  async waitForBossBarAction(
    action: number,
    timeoutMs = 10_000,
    fromIndex = 0,
  ): Promise<BossBarPacket> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const hit = this.bossBarLog.slice(fromIndex).find((p) => p.action === action);
      if (hit !== undefined) return hit;
      if (Date.now() >= deadline) {
        throw new Error(
          `timed out after ${timeoutMs}ms waiting for a boss bar packet with action ${action}; saw ${JSON.stringify(this.bossBarLog)}`,
        );
      }
      await sleep(150);
    }
  }

  async activateEntityByName(entityName: string, timeoutMs = 10_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const entity = Object.values(this.bot.entities).find((e) => e.name === entityName);
      if (entity !== undefined) {
        await this.bot.lookAt(entity.position.offset(0, 1, 0));
        this.bot.activateEntity(entity);
        return;
      }
      if (Date.now() >= deadline) {
        throw new Error(
          `timed out after ${timeoutMs}ms waiting for a visible "${entityName}" entity`,
        );
      }
      await sleep(250);
    }
  }

  // Phase 22 controls (see the interface for the rationale).

  async lookAtPoint(x: number, y: number, z: number): Promise<void> {
    const point = this.bot.entity.position.clone();
    point.x = x;
    point.y = y;
    point.z = z;
    await this.bot.lookAt(point);
  }

  activateItem(): void {
    this.bot.activateItem();
  }

  deactivateItem(): void {
    this.bot.deactivateItem();
  }

  async fishOnce(timeoutMs = 90_000): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.bot.fish(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`fishOnce timed out after ${timeoutMs}ms`)),
            timeoutMs,
          );
        }),
      ]);
    } catch (e) {
      // Reel the line back in so the next cast starts clean.
      try {
        this.bot.activateItem();
        await sleep(400);
        this.bot.deactivateItem();
      } catch {
        // the rod may already be in; nothing to reset
      }
      throw e;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  async attackEntityByName(entityName: string, timeoutMs = 10_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const entities = Object.values(this.bot.entities).filter((e) => e.name === entityName);
      entities.sort(
        (a, b) =>
          a.position.distanceTo(this.bot.entity.position) -
          b.position.distanceTo(this.bot.entity.position),
      );
      const entity = entities[0];
      if (entity !== undefined) {
        await this.bot.lookAt(entity.position.offset(0, 1, 0));
        this.bot.attack(entity);
        return;
      }
      if (Date.now() >= deadline) {
        throw new Error(
          `timed out after ${timeoutMs}ms waiting for a visible "${entityName}" entity`,
        );
      }
      await sleep(250);
    }
  }

  async tossItem(itemName: string): Promise<void> {
    const found = (this.bot.inventory?.items() ?? []).find((it) => it.name === itemName);
    if (found === undefined) {
      const names =
        (this.bot.inventory?.items() ?? []).map((it) => it.name).join(", ") || "(empty)";
      throw new Error(`cannot toss "${itemName}": not in inventory (${names})`);
    }
    await this.bot.tossStack(found);
  }

  async expectNoInventoryItem(itemName: string, timeoutMs = 10_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const items = this.bot.inventory?.items() ?? [];
      if (!items.some((it) => it.name === itemName)) return;
      if (Date.now() >= deadline) {
        const names = items.map((it) => `${it.name} x${it.count}`).join(", ") || "(empty)";
        throw new Error(
          `timed out after ${timeoutMs}ms waiting for "${itemName}" to leave the inventory; inventory: ${names}`,
        );
      }
      await sleep(250);
    }
  }

  async sleepAt(x: number, y: number, z: number): Promise<void> {
    const block = this.blockAt(x, y, z);
    if (block === null) {
      throw new Error(`no bed block at ${x}, ${y}, ${z}`);
    }
    await this.bot.sleep(block);
  }

  async wake(): Promise<void> {
    await this.bot.wake();
  }

  closeWindow(): void {
    if (this.bot.currentWindow) {
      try {
        this.bot.closeWindow(this.bot.currentWindow);
      } catch {
        // the window may already be gone server-side
      }
    }
  }

  async waitForWindow(titlePart?: string, timeoutMs = 10_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const win = this.bot.currentWindow;
      // The bot's own inventory screen is also a "window" in
      // mineflayer; a container window is any other type.
      if (win && win.type !== "minecraft:inventory") {
        if (titlePart === undefined || this.windowTitle()?.includes(titlePart)) return;
      }
      if (Date.now() >= deadline) {
        throw new Error(
          `timed out after ${timeoutMs}ms waiting for a window${titlePart ? ` titled "${titlePart}"` : ""}; current title: ${this.windowTitle() ?? "(none)"}`,
        );
      }
      await sleep(200);
    }
  }

  windowTitle(): string | null {
    const win = this.bot.currentWindow;
    if (!win || win.type === "minecraft:inventory") return null;
    return typeof win.title === "string" ? win.title : JSON.stringify(win.title);
  }

  windowSlotItem(slot: number): WindowSlotItem | null {
    const win = this.bot.currentWindow;
    if (!win) return null;
    return readWindowItem(win.slots[slot]);
  }

  async clickWindowSlot(slot: number, button = 0): Promise<void> {
    if (!this.bot.currentWindow) {
      throw new Error("cannot click a window slot: no window is open");
    }
    await this.bot.clickWindow(slot, button, 0);
  }

  cursorItem(): WindowSlotItem | null {
    const win = this.bot.currentWindow ?? this.bot.inventory;
    if (!win) return null;
    const selected: unknown = (win as unknown as { selectedItem?: unknown }).selectedItem;
    return readWindowItem(selected);
  }

  /**
   * Drag the carried item across the given raw window slots in
   * order. prismarine-windows' `Window.acceptClick` throws for
   * click mode 5 (its drag path is unimplemented), and mineflayer
   * calls it before writing the packet — so the window instance's
   * method is shadowed with a no-op for the duration of the drag.
   * mineflayer still writes correct window_click packets (window
   * id, state id and the cursor item are its own bookkeeping);
   * the server's slot updates then correct the client state, so
   * callers poll windowSlotItem / cursorItem for the outcome
   * rather than trusting instant state.
   */
  async dragWindowSlots(slots: number[], side: "left" | "right"): Promise<void> {
    const win = this.bot.currentWindow;
    if (!win) {
      throw new Error("cannot drag window slots: no window is open");
    }
    const target = win as unknown as { acceptClick?: (...args: unknown[]) => unknown };
    const originalAcceptClick = target.acceptClick;
    target.acceptClick = () => [];
    try {
      const startButton = side === "left" ? 0 : 4;
      const slotButton = side === "left" ? 1 : 5;
      const endButton = side === "left" ? 2 : 6;
      await this.bot.clickWindow(-999, startButton, 5);
      await sleep(150);
      for (const slot of slots) {
        await this.bot.clickWindow(slot, slotButton, 5);
        await sleep(150);
      }
      await this.bot.clickWindow(-999, endButton, 5);
    } finally {
      target.acceptClick = originalAcceptClick;
    }
  }
}

/** Read a prismarine item (a window slot's content or the cursor's carried item) as a WindowSlotItem. */
function readWindowItem(item: unknown): WindowSlotItem | null {
  if (typeof item !== "object" || item === null) return null;
  const record = item as { name?: unknown; count?: unknown; components?: unknown };
  if (typeof record.name !== "string" || typeof record.count !== "number") return null;
  // Custom name / lore travel as item components (1.20.5+):
  // an array of {type, data} entries whose data is a chat
  // component (a bare string or an object with a text/value).
  // (prismarine-item's typings lag the component model, so the
  // property is read through an unknown cast.)
  let customName: string | null = null;
  let lore: string[] = [];
  const components: unknown = record.components;
  if (Array.isArray(components)) {
    for (const entry of components as { type?: unknown; data?: unknown }[]) {
      if (entry.type === "custom_name") {
        customName = componentText(entry.data);
      } else if (entry.type === "lore" && Array.isArray(entry.data)) {
        lore = entry.data.map((line) => componentText(line) ?? "");
      }
    }
  }
  return { name: record.name, count: record.count, customName, lore };
}

/** Read the plain text out of a chat-component-shaped value (a bare string, or an object holding text/value). */
function componentText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value !== null && typeof value === "object") {
    const rec = value as Record<string, unknown>;
    if (typeof rec.value === "string") return rec.value;
    if (typeof rec.text === "string") return rec.text;
  }
  return null;
}

export interface BehaviorContextOptions {
  host: string;
  port: number;
  /** Minecraft version string for the protocol, e.g. "1.21.11". */
  version: string;
  /** Bridge to the server console (used by t.console). */
  console: (command: string) => void;
  /** Runtime mode of the sandbox under test. Defaults to "skript". */
  mode?: "skript" | "engine";
}

export function createBehaviorContext(opts: BehaviorContextOptions): BehaviorContext {
  return {
    mode: opts.mode ?? "skript",
    async connect(username: string): Promise<BehaviorBot> {
      const bot = createBot({
        host: opts.host,
        port: opts.port,
        username,
        version: opts.version,
        auth: "offline",
      });
      const wrapped = new MineflayerBehaviorBot(bot);
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`bot "${username}" did not spawn within 30s`)),
          30_000,
        );
        timer.unref();
        bot.once("spawn", () => {
          clearTimeout(timer);
          resolve();
        });
        bot.once("error", (err) => {
          clearTimeout(timer);
          reject(err instanceof Error ? err : new Error(String(err)));
        });
        bot.once("kicked", (reason) => {
          clearTimeout(timer);
          reject(new Error(`bot "${username}" was kicked during login: ${String(reason)}`));
        });
      });
      return wrapped;
    },
    async console(command: string): Promise<void> {
      opts.console(command);
      await sleep(300);
    },
    sleep,
  };
}
