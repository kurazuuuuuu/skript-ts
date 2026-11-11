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
  waitForSoundNear(x: number, y: number, z: number, radius?: number, timeoutMs?: number, fromIndex?: number): Promise<SoundPacket>;
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
  /** Left-click a window slot (raw window index: top inventory first, then the player's own inventory). */
  clickWindowSlot(slot: number): Promise<void>;
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

class MineflayerBehaviorBot implements BehaviorBot {
  readonly messages: string[] = [];
  private readonly sounds: SoundPacket[] = [];
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
    const client = (this.bot as unknown as {
      _client: { on(ev: string, fn: (p: RawSoundPacket) => void): void };
    })._client;
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
        reject(new Error(`timed out after ${timeoutMs}ms waiting for message ${String(pattern)}; recent messages: ${recent}`));
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
        throw new Error(`timed out after ${timeoutMs}ms waiting for inventory item "${itemName}"; inventory: ${names}`);
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
        const names = (this.bot.inventory?.items() ?? []).map((it) => it.name).join(", ") || "(empty)";
        throw new Error(`timed out after ${timeoutMs}ms waiting to equip "${itemName}"; inventory: ${names}`);
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

  async waitForSoundNear(x: number, y: number, z: number, radius = 3, timeoutMs = 10_000, fromIndex = 0): Promise<SoundPacket> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const hit = this.sounds.slice(fromIndex).find(
        (s) => Math.abs(s.x - x) <= radius && Math.abs(s.y - y) <= radius && Math.abs(s.z - z) <= radius,
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
        throw new Error(`timed out after ${timeoutMs}ms waiting for a visible "${entityName}" entity`);
      }
      await sleep(250);
    }
  }

  async tossItem(itemName: string): Promise<void> {
    const found = (this.bot.inventory?.items() ?? []).find((it) => it.name === itemName);
    if (found === undefined) {
      const names = (this.bot.inventory?.items() ?? []).map((it) => it.name).join(", ") || "(empty)";
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
        throw new Error(`timed out after ${timeoutMs}ms waiting for "${itemName}" to leave the inventory; inventory: ${names}`);
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
    const item = win.slots[slot];
    if (!item) return null;
    // Custom name / lore travel as item components (1.20.5+):
    // an array of {type, data} entries whose data is a chat
    // component (a bare string or an object with a text/value).
    // (prismarine-item's typings lag the component model, so the
    // property is read through an unknown cast.)
    let customName: string | null = null;
    let lore: string[] = [];
    const components: unknown = (item as unknown as { components?: unknown }).components;
    if (Array.isArray(components)) {
      for (const entry of components as { type?: unknown; data?: unknown }[]) {
        if (entry.type === "custom_name") {
          customName = componentText(entry.data);
        } else if (entry.type === "lore" && Array.isArray(entry.data)) {
          lore = entry.data.map((line) => componentText(line) ?? "");
        }
      }
    }
    return { name: item.name, count: item.count, customName, lore };
  }

  async clickWindowSlot(slot: number): Promise<void> {
    if (!this.bot.currentWindow) {
      throw new Error("cannot click a window slot: no window is open");
    }
    await this.bot.clickWindow(slot, 0, 0);
  }
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
        const timer = setTimeout(() => reject(new Error(`bot "${username}" did not spawn within 30s`)), 30_000);
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
