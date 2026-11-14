/**
 * Project-build resolution of `customItem` references (RP-2) and
 * `fontCharOf` references (RP-4).
 *
 * A `customItem` expression node is created UNRESOLVED — it carries
 * only the `ref` the author wrote. Before emit/IR, the project
 * build walks every script and replaces each such node with its
 * resolved form: the pack item's resolved id (which is also the
 * `item_model` component value), its base item, the registry
 * CustomModelData number allocated for it, and the display name
 * the pack definition declared. A reference that matches no pack
 * item is a build error here, never a silent runtime miss.
 *
 * A `fontCharOf` node is UNRESOLVED the same way; the walk
 * replaces it with a plain string literal node carrying the pack
 * font char's resolved character (explicit, or auto-allocated
 * from the font-char registry), so emit and the engine only ever
 * see text.
 *
 * The walk is a structural clone over plain objects and arrays —
 * AST nodes are plain data by design. Class instances (there are
 * none in the AST) would pass through untouched.
 */
import type { Expr, Script } from "./ast.js";
import type { PackDef } from "./resourcepack.js";
import { parseResourceId } from "./resourcepack.js";

export interface ResolvedCustomItem {
  id: string;
  baseItem: string;
  customModelData?: number;
  displayName?: string;
}

function formatResourceId(parts: { namespace: string; path: string }): string {
  return `${parts.namespace}:${parts.path}`;
}

/**
 * Build the resolution table for a pack: resolved item id ->
 * everything a `customItem` node needs. `allocations` maps resolved
 * item ids to their registry CustomModelData numbers.
 */
export function buildCustomItemTable(
  pack: PackDef,
  allocations: ReadonlyMap<string, number>,
): ReadonlyMap<string, ResolvedCustomItem> {
  const table = new Map<string, ResolvedCustomItem>();
  for (const item of pack.items) {
    const id = formatResourceId(parseResourceId(item.id, pack.namespace));
    const baseItem = formatResourceId(parseResourceId(item.baseItem, pack.namespace));
    const resolved: ResolvedCustomItem = { id, baseItem };
    const customModelData = allocations.get(id);
    if (customModelData !== undefined) {
      resolved.customModelData = customModelData;
    }
    if (item.displayName !== undefined) {
      resolved.displayName = item.displayName;
    }
    table.set(id, resolved);
  }
  return table;
}

/**
 * Build the font-char resolution table for a pack: resolved font
 * char id -> its character. `allocations` maps resolved font
 * char ids to the characters the font-char registry assigned
 * (auto-allocated private-use chars, and explicit chars recorded
 * there); a definition's own explicit char is the fallback, so a
 * pack whose registry is already complete resolves identically.
 * Font chars with neither an allocation nor an explicit char
 * are absent from the table — resolving a reference to one is
 * the same build error as an unknown reference.
 */
export function buildFontCharTable(
  pack: PackDef,
  allocations: ReadonlyMap<string, string>,
): ReadonlyMap<string, string> {
  const table = new Map<string, string>();
  for (const fontChar of pack.fontChars) {
    const id = formatResourceId(parseResourceId(fontChar.id, pack.namespace));
    const char = allocations.get(id) ?? fontChar.char;
    if (char !== undefined) {
      table.set(id, char);
    }
  }
  return table;
}

/**
 * Return a copy of `pack` with every font char's `char` filled
 * from `allocations` (keyed by resolved font char id) or its own
 * explicit char. Pack generation requires resolved chars, so a
 * font char left without one is an error here.
 */
export function resolvePackFontChars(
  pack: PackDef,
  allocations: ReadonlyMap<string, string>,
): PackDef {
  const fontChars = pack.fontChars.map((fontChar) => {
    const id = formatResourceId(parseResourceId(fontChar.id, pack.namespace));
    const char = allocations.get(id) ?? fontChar.char;
    if (char === undefined) {
      throw new Error(
        `resolvePackFontChars: font char "${id}" has no resolved char; ` +
          `auto-allocated chars are resolved by the project build`,
      );
    }
    return { ...fontChar, char };
  });
  return { ...pack, fontChars };
}

function isPlainObject(value: object): value is Record<string, unknown> {
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Return a copy of `script` with every `customItem` node resolved
 * against `table`. `packNamespace` resolves bare refs (no namespace)
 * the same way pack definitions resolve their own ids. Throws when
 * a ref names no pack item.
 *
 * When `fontCharTable` is given, `fontCharOf` nodes are resolved
 * against it in the same walk — same ref rules as `customItem` —
 * and replaced by string literal nodes. Without the table (or for
 * a ref it does not contain), a `fontCharOf` node is a build
 * error, exactly like an unknown `customItem` ref.
 */
export function resolveCustomItems(
  script: Script,
  table: ReadonlyMap<string, ResolvedCustomItem>,
  sourceName: string,
  packNamespace: string,
  fontCharTable?: ReadonlyMap<string, string>,
): Script {
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map((entry) => walk(entry));
    }
    if (value !== null && typeof value === "object") {
      if (!isPlainObject(value)) {
        return value;
      }
      const record = value as unknown as Expr & Record<string, unknown>;
      if (record.kind === "fontCharOf") {
        const ref = record.ref;
        if (typeof ref !== "string") {
          throw new Error(`resolveCustomItems(${sourceName}): fontCharOf has a non-string ref`);
        }
        const resolvedRef = formatResourceId(parseResourceId(ref, packNamespace));
        const char = fontCharTable?.get(resolvedRef);
        if (char === undefined) {
          throw new Error(
            `resolveCustomItems(${sourceName}): font char "${resolvedRef}" is not defined in the project's resource pack`,
          );
        }
        return { kind: "string", value: char };
      }
      if (record.kind === "customItem") {
        const ref = record.ref;
        if (typeof ref !== "string") {
          throw new Error(`resolveCustomItems(${sourceName}): customItem has a non-string ref`);
        }
        const resolvedRef = formatResourceId(parseResourceId(ref, packNamespace));
        const resolved = table.get(resolvedRef);
        if (resolved === undefined) {
          throw new Error(
            `resolveCustomItems(${sourceName}): custom item "${resolvedRef}" is not defined in the project's resource pack`,
          );
        }
        const node: Record<string, unknown> = {};
        for (const [key, entry] of Object.entries(record)) {
          if (
            key === "id" ||
            key === "baseItem" ||
            key === "customModelData" ||
            key === "displayName"
          ) {
            continue;
          }
          node[key] = walk(entry);
        }
        node.id = resolved.id;
        node.baseItem = resolved.baseItem;
        if (resolved.customModelData !== undefined) {
          node.customModelData = resolved.customModelData;
        }
        if (resolved.displayName !== undefined) {
          node.displayName = resolved.displayName;
        }
        return node;
      }
      const copy: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(record)) {
        copy[key] = walk(entry);
      }
      return copy;
    }
    return value;
  };
  return walk(script) as Script;
}
