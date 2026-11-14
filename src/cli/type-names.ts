import { MATERIAL_NAMES } from "./material-names.js";

/**
 * An item type name problem found while validating a Script value.
 *
 * Hard issues are near misses against the canonical Bukkit material names and
 * should fail the build. Soft issues are names the material list does not know;
 * they may still be valid Skript slotted aliases, so they are only warnings and
 * must never fail the build.
 */
export interface ItemNameIssue {
  name: string;
  suggestions: string[];
  hard: boolean;
}

const MATERIAL_NAME_SET: ReadonlySet<string> = new Set(MATERIAL_NAMES);

/**
 * Recursively walks a Script value structurally, looking for any object with
 * `kind: "item"` and a string `name`. The walk is structural: it does not rely
 * on a particular script shape, so any `{ kind: "item", name: "..." }` node
 * nested in objects or arrays is considered.
 */
export function findItemNameIssues(root: unknown): ItemNameIssue[] {
  const names = collectItemNames(root);
  const issues: ItemNameIssue[] = [];

  for (const name of names) {
    const normalized = normalizeItemName(name);
    if (MATERIAL_NAME_SET.has(normalized)) {
      continue;
    }

    const suggestions = suggestMaterialNames(normalized);
    issues.push({
      name,
      suggestions,
      hard: suggestions.length > 0,
    });
  }

  return issues;
}

/**
 * Formats an item name issue for CLI output.
 *
 * Hard issues are build errors and include typo suggestions. Soft issues are
 * warnings only: slotted Skript aliases are valid at runtime even though they
 * are not Bukkit material names.
 */
export function formatItemNameIssue(relSource: string, issue: ItemNameIssue): string {
  if (issue.hard) {
    const suggestions = issue.suggestions
      .map((suggestion) => `"${suggestion.toLowerCase().replace(/_/g, " ")}"`)
      .join(", ");
    return `${relSource}: unknown item type "${issue.name}" — did you mean ${suggestions}?`;
  }

  return `${relSource}: item type "${issue.name}" is not a known material name (it may be a Skript alias; the engine resolves material names only)`;
}

function collectItemNames(root: unknown): string[] {
  const names: string[] = [];
  const seenNames = new Set<string>();
  const visited = new WeakSet<object>();

  const visit = (value: unknown): void => {
    if (typeof value !== "object" || value === null) {
      return;
    }
    if (visited.has(value)) {
      return;
    }
    visited.add(value);

    if (Array.isArray(value)) {
      for (const entry of value) {
        visit(entry);
      }
      return;
    }

    const record = value as Record<string, unknown>;
    if (record.kind === "item" && typeof record.name === "string") {
      const name = record.name;
      if (!seenNames.has(name)) {
        seenNames.add(name);
        names.push(name);
      }
    }

    for (const child of Object.values(record)) {
      visit(child);
    }
  };

  visit(root);
  return names;
}

function normalizeItemName(name: string): string {
  return name.trim().replace(/\s+/g, "_").toUpperCase();
}

function suggestMaterialNames(normalized: string): string[] {
  const candidates: { distance: number; name: string }[] = [];

  for (const materialName of MATERIAL_NAMES) {
    const distance = levenshtein(normalized, normalizeItemName(materialName));
    if (distance <= 2) {
      candidates.push({ distance, name: materialName });
    }
  }

  candidates.sort((left, right) => {
    if (left.distance !== right.distance) {
      return left.distance - right.distance;
    }
    return left.name < right.name ? -1 : left.name > right.name ? 1 : 0;
  });

  return candidates.slice(0, 3).map((candidate) => candidate.name);
}

function levenshtein(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  if (left.length === 0) {
    return right.length;
  }
  if (right.length === 0) {
    return left.length;
  }

  let previous = new Array<number>(right.length + 1);
  for (let column = 0; column <= right.length; column += 1) {
    previous[column] = column;
  }

  for (let row = 1; row <= left.length; row += 1) {
    const current = new Array<number>(right.length + 1);
    current[0] = row;
    const leftChar = left.charAt(row - 1);

    for (let column = 1; column <= right.length; column += 1) {
      const rightChar = right.charAt(column - 1);
      const substitutionCost = leftChar === rightChar ? 0 : 1;
      const deletion = (previous[column] ?? 0) + 1;
      const insertion = (current[column - 1] ?? 0) + 1;
      const substitution = (previous[column - 1] ?? 0) + substitutionCost;
      current[column] = Math.min(deletion, insertion, substitution);
    }

    previous = current;
  }

  return previous[right.length] ?? 0;
}
