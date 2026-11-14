/**
 * Persisted resource pack custom model data registry.
 */
export interface PackRegistry {
  version: 1;
  items: Record<string, number>;
}

/**
 * A request for a custom model data number.
 */
export interface CustomModelDataRequest {
  id: string;
  customModelData?: number;
}

function fail(message: string): never {
  throw new Error(`packregistry: ${message}`);
}

function describeValue(value: unknown): string {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (typeof value === "bigint") {
    return `${value.toString()}n`;
  }
  if (typeof value === "symbol") {
    return value.toString();
  }
  if (typeof value === "function") {
    return "[function]";
  }
  if (value === undefined) {
    return "undefined";
  }
  if (value === null) {
    return "null";
  }
  if (typeof value === "boolean") {
    return String(value);
  }
  try {
    const json = JSON.stringify(value);
    return json === undefined ? Object.prototype.toString.call(value) : json;
  } catch {
    return Object.prototype.toString.call(value);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Creates an empty registry.
 */
export function emptyRegistry(): PackRegistry {
  return { version: 1, items: {} };
}

/**
 * Parses and strictly validates a serialized registry.
 */
export function parseRegistry(text: string): PackRegistry {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail("invalid JSON");
  }

  if (!isPlainObject(parsed)) {
    return fail("expected a plain object");
  }

  if (parsed.version !== 1) {
    return fail(`expected version 1, got ${describeValue(parsed.version)}`);
  }

  const parsedItems = parsed.items;
  if (!isPlainObject(parsedItems)) {
    return fail("expected items to be a plain object");
  }

  const entries: Array<[string, number]> = [];
  for (const [id, value] of Object.entries(parsedItems)) {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
      return fail(
        `item ${describeValue(id)} must be a positive integer, got ${describeValue(value)}`,
      );
    }
    entries.push([id, value]);
  }

  const items: Record<string, number> = Object.fromEntries(entries);
  return { version: 1, items };
}

/**
 * Serializes a registry with sorted keys and a trailing newline.
 */
export function serializeRegistry(registry: PackRegistry): string {
  const sortedKeys = Object.keys(registry.items).sort();
  const sortedEntries: Array<[string, number]> = sortedKeys.map((key) => [
    key,
    registry.items[key] as number,
  ]);
  const items: Record<string, number> = Object.fromEntries(sortedEntries);
  return `${JSON.stringify({ version: registry.version, items }, null, 2)}\n`;
}

/**
 * Allocates custom model data numbers for a batch of requests.
 *
 * The input registry is not mutated. When at least one new id is allocated, a
 * new registry is returned; otherwise the original registry is returned.
 */
export function allocateCustomModelData(
  registry: PackRegistry,
  requests: readonly CustomModelDataRequest[],
): {
  allocations: Map<string, number>;
  registry: PackRegistry;
  changed: boolean;
} {
  interface BatchEntry {
    explicit?: number;
    hasExplicit: boolean;
  }

  const batch = new Map<string, BatchEntry>();
  const order: string[] = [];

  for (let index = 0; index < requests.length; index += 1) {
    const request = requests[index] as CustomModelDataRequest | undefined;
    if (request === undefined) {
      return fail(`request at index ${index} is missing`);
    }

    const rawId: unknown = request.id;
    if (typeof rawId !== "string" || rawId.length === 0) {
      return fail(
        `request at index ${index} has invalid id ${describeValue(
          rawId,
        )}; expected a non-empty string`,
      );
    }
    const id = rawId;

    const rawCustomModelData: unknown = request.customModelData;
    const hasExplicit = rawCustomModelData !== undefined;
    let explicit: number | undefined;

    if (hasExplicit) {
      if (
        typeof rawCustomModelData !== "number" ||
        !Number.isInteger(rawCustomModelData) ||
        rawCustomModelData < 1
      ) {
        return fail(
          `id ${describeValue(id)} requested invalid customModelData ${describeValue(
            rawCustomModelData,
          )}; expected an integer >= 1`,
        );
      }
      explicit = rawCustomModelData;
    }

    const existing = batch.get(id);
    if (existing === undefined) {
      batch.set(id, { explicit, hasExplicit });
      order.push(id);
      continue;
    }

    if (existing.hasExplicit && hasExplicit && existing.explicit !== explicit) {
      return fail(
        `id ${describeValue(id)} requested conflicting customModelData values ${describeValue(
          existing.explicit,
        )} and ${describeValue(explicit)}`,
      );
    }

    if (hasExplicit && !existing.hasExplicit) {
      existing.explicit = explicit;
      existing.hasExplicit = true;
    }
  }

  const workingItems = new Map<string, number>();
  const holders = new Map<number, string>();
  let max = 0;

  for (const [id, value] of Object.entries(registry.items)) {
    workingItems.set(id, value);
    holders.set(value, id);
    if (value > max) {
      max = value;
    }
  }

  const allocations = new Map<string, number>();
  let changed = false;

  for (const id of order) {
    const entry = batch.get(id);
    if (entry === undefined) {
      continue;
    }

    const existing = workingItems.get(id);

    if (entry.hasExplicit) {
      const requested = entry.explicit;
      if (requested === undefined) {
        return fail(`id ${describeValue(id)} has no explicit customModelData`);
      }

      if (existing !== undefined) {
        if (existing !== requested) {
          return fail(
            `id ${describeValue(id)} already has customModelData ${describeValue(
              existing,
            )}; requested ${describeValue(requested)}`,
          );
        }
        allocations.set(id, existing);
        continue;
      }

      const holder = holders.get(requested);
      if (holder !== undefined && holder !== id) {
        return fail(
          `id ${describeValue(id)} requested customModelData ${describeValue(
            requested,
          )}, which is already held by id ${describeValue(holder)}`,
        );
      }

      workingItems.set(id, requested);
      holders.set(requested, id);
      if (requested > max) {
        max = requested;
      }
      changed = true;
      allocations.set(id, requested);
      continue;
    }

    if (existing !== undefined) {
      allocations.set(id, existing);
      continue;
    }

    const allocated = max + 1;
    workingItems.set(id, allocated);
    holders.set(allocated, id);
    max = allocated;
    changed = true;
    allocations.set(id, allocated);
  }

  if (!changed) {
    return { allocations, registry, changed: false };
  }

  const items: Record<string, number> = Object.fromEntries(workingItems);
  return {
    allocations,
    registry: { version: 1, items },
    changed: true,
  };
}

/* ------------------------------------------------------------------ */
/* Font character registry (RP-4)                                      */
/*                                                                     */
/* The same append-only discipline as the CustomModelData registry   */
/* above, over Unicode code points instead of numbers: an id, once   */
/* assigned a character, keeps it forever; a deleted definition's    */
/* character stays reserved; auto-allocation walks the Unicode       */
/* private use area U+E000..U+F8FF in max + 1 order.                   */
/* ------------------------------------------------------------------ */

/**
 * Persisted font character registry. Values are Unicode code
 * points (numbers), keyed by resolved font char id (`ns:path`).
 */
export interface FontCharRegistry {
  version: 1;
  chars: Record<string, number>;
}

/**
 * A request for a font character.
 */
export interface FontCharRequest {
  id: string;
  char?: string;
}

const PUA_START = 0xe000;
const PUA_END = 0xf8ff;
const SURROGATE_START = 0xd800;
const SURROGATE_END = 0xdfff;
const MAX_CODE_POINT = 0x10ffff;

function isSurrogate(codePoint: number): boolean {
  return codePoint >= SURROGATE_START && codePoint <= SURROGATE_END;
}

function isPua(codePoint: number): boolean {
  return codePoint >= PUA_START && codePoint <= PUA_END;
}

/** The single code point of a one-code-point string, or undefined. */
function singleCodePoint(value: string): number | undefined {
  if (value.length === 0) {
    return undefined;
  }
  const codePoint = value.codePointAt(0);
  if (codePoint === undefined) {
    return undefined;
  }
  // A code point occupies one UTF-16 unit, or two (a surrogate
  // pair) above U+FFFF; anything longer is more than one point.
  const units = codePoint > 0xffff ? 2 : 1;
  return value.length === units ? codePoint : undefined;
}

/**
 * Creates an empty font character registry.
 */
export function emptyFontCharRegistry(): FontCharRegistry {
  return { version: 1, chars: {} };
}

/**
 * Parses and strictly validates a serialized font character
 * registry. Values must be integer code points in
 * 0..0x10FFFF; the surrogate range U+D800..U+DFFF is rejected
 * (a lone surrogate is not a usable character).
 */
export function parseFontCharRegistry(text: string): FontCharRegistry {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail("invalid JSON");
  }

  if (!isPlainObject(parsed)) {
    return fail("expected a plain object");
  }

  if (parsed.version !== 1) {
    return fail(`expected version 1, got ${describeValue(parsed.version)}`);
  }

  const parsedChars = parsed.chars;
  if (!isPlainObject(parsedChars)) {
    return fail("expected chars to be a plain object");
  }

  const entries: Array<[string, number]> = [];
  for (const [id, value] of Object.entries(parsedChars)) {
    if (
      typeof value !== "number" ||
      !Number.isInteger(value) ||
      value < 0 ||
      value > MAX_CODE_POINT ||
      isSurrogate(value)
    ) {
      return fail(
        `char ${describeValue(id)} must be an integer code point between 0 and 0x10FFFF ` +
          `(surrogates excluded), got ${describeValue(value)}`,
      );
    }
    entries.push([id, value]);
  }

  const chars: Record<string, number> = Object.fromEntries(entries);
  return { version: 1, chars };
}

/**
 * Serializes a font character registry with sorted keys and a
 * trailing newline (the same style as serializeRegistry).
 */
export function serializeFontCharRegistry(registry: FontCharRegistry): string {
  const sortedKeys = Object.keys(registry.chars).sort();
  const sortedEntries: Array<[string, number]> = sortedKeys.map((key) => [
    key,
    registry.chars[key] as number,
  ]);
  const chars: Record<string, number> = Object.fromEntries(sortedEntries);
  return `${JSON.stringify({ version: registry.version, chars }, null, 2)}\n`;
}

/**
 * Allocates font characters for a batch of requests.
 *
 * An explicit `char` request is honored when it is free; an
 * omitted `char` auto-allocates the next private-use code point
 * (the maximum PUA code point in the registry or allocated
 * earlier in this batch, plus one — an explicit char outside
 * the PUA never moves the auto sequence).
 *
 * The input registry is not mutated. When at least one new id
 * is allocated, a new registry is returned; otherwise the
 * original registry is returned.
 */
export function allocateFontChars(
  registry: FontCharRegistry,
  requests: readonly FontCharRequest[],
): {
  allocations: Map<string, string>;
  registry: FontCharRegistry;
  changed: boolean;
} {
  interface BatchEntry {
    explicit?: number;
    hasExplicit: boolean;
  }

  const batch = new Map<string, BatchEntry>();
  const order: string[] = [];

  for (let index = 0; index < requests.length; index += 1) {
    const request = requests[index] as FontCharRequest | undefined;
    if (request === undefined) {
      return fail(`request at index ${index} is missing`);
    }

    const rawId: unknown = request.id;
    if (typeof rawId !== "string" || rawId.length === 0) {
      return fail(
        `request at index ${index} has invalid id ${describeValue(
          rawId,
        )}; expected a non-empty string`,
      );
    }
    const id = rawId;

    const rawChar: unknown = request.char;
    const hasExplicit = rawChar !== undefined;
    let explicit: number | undefined;

    if (hasExplicit) {
      const codePoint = typeof rawChar === "string" ? singleCodePoint(rawChar) : undefined;
      if (codePoint === undefined || isSurrogate(codePoint)) {
        return fail(
          `id ${describeValue(id)} requested invalid char ${describeValue(
            rawChar,
          )}; expected exactly one code point (a lone surrogate is not allowed)`,
        );
      }
      explicit = codePoint;
    }

    const existing = batch.get(id);
    if (existing === undefined) {
      batch.set(id, { explicit, hasExplicit });
      order.push(id);
      continue;
    }

    if (existing.hasExplicit && hasExplicit && existing.explicit !== explicit) {
      return fail(
        `id ${describeValue(id)} requested conflicting chars ${describeValue(
          String.fromCodePoint(existing.explicit as number),
        )} and ${describeValue(String.fromCodePoint(explicit as number))}`,
      );
    }

    if (hasExplicit && !existing.hasExplicit) {
      existing.explicit = explicit;
      existing.hasExplicit = true;
    }
  }

  const workingChars = new Map<string, number>();
  const holders = new Map<number, string>();
  // The auto-allocation frontier: the largest PUA code point in
  // the registry, advanced by every PUA allocation in this batch.
  let maxPua = PUA_START - 1;

  for (const [id, value] of Object.entries(registry.chars)) {
    workingChars.set(id, value);
    holders.set(value, id);
    if (isPua(value) && value > maxPua) {
      maxPua = value;
    }
  }

  const allocations = new Map<string, string>();
  let changed = false;

  for (const id of order) {
    const entry = batch.get(id);
    if (entry === undefined) {
      continue;
    }

    const existing = workingChars.get(id);

    if (entry.hasExplicit) {
      const requested = entry.explicit;
      if (requested === undefined) {
        return fail(`id ${describeValue(id)} has no explicit char`);
      }

      if (existing !== undefined) {
        if (existing !== requested) {
          return fail(
            `id ${describeValue(id)} already has char ${describeValue(
              String.fromCodePoint(existing),
            )}; requested ${describeValue(String.fromCodePoint(requested))}`,
          );
        }
        allocations.set(id, String.fromCodePoint(existing));
        continue;
      }

      const holder = holders.get(requested);
      if (holder !== undefined && holder !== id) {
        return fail(
          `id ${describeValue(id)} requested char ${describeValue(
            String.fromCodePoint(requested),
          )}, which is already held by id ${describeValue(holder)}`,
        );
      }

      workingChars.set(id, requested);
      holders.set(requested, id);
      if (isPua(requested) && requested > maxPua) {
        maxPua = requested;
      }
      changed = true;
      allocations.set(id, String.fromCodePoint(requested));
      continue;
    }

    if (existing !== undefined) {
      allocations.set(id, String.fromCodePoint(existing));
      continue;
    }

    const allocated = maxPua + 1;
    if (allocated > PUA_END) {
      return fail(
        `private use area exhausted: no code point left at or below U+F8FF for id ${describeValue(id)}`,
      );
    }
    workingChars.set(id, allocated);
    holders.set(allocated, id);
    maxPua = allocated;
    changed = true;
    allocations.set(id, String.fromCodePoint(allocated));
  }

  if (!changed) {
    return { allocations, registry, changed: false };
  }

  const chars: Record<string, number> = Object.fromEntries(workingChars);
  return {
    allocations,
    registry: { version: 1, chars },
    changed: true,
  };
}
