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

class MineflayerBehaviorBot implements BehaviorBot {
  readonly messages: string[] = [];
  private readonly waiters: {
    pattern: RegExp | string;
    resolve: (msg: string) => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout;
  }[] = [];
  private failure: Error | null = null;

  constructor(private readonly bot: Bot) {
    this.bot.on("messagestr", (raw) => {
      const msg = stripColor(raw);
      this.messages.push(msg);
      if (this.messages.length > 200) this.messages.shift();
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
