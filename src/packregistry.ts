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
