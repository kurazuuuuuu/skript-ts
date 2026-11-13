/**
 * resourcepack.ts
 *
 * Declarative resource pack definition API + validation only.
 * Pure module: no Node APIs (no fs / path / zlib / crypto).
 * All validation happens inside the `define*` functions so invalid
 * definitions never reach the generation step.
 *
 * Notes: "transparent" is matched case-sensitively. Inline TextureDef
 * objects are trusted to come from defineTexture() (their contents are
 * not re-validated here); cross-references and duplicates are checked
 * in definePack().
 */

const NAMESPACE_PATTERN = /^[a-z0-9_.-]+$/;
const PATH_PATTERN = /^[a-z0-9_./-]+$/;
const COLOR_PATTERN = /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const UPPERCASE_PATTERN = /[A-Z]/;
const PNG_SUFFIX_PATTERN = /\.png$/i;

const DEFAULT_TEXTURE_SIZE: readonly [number, number] = [16, 16];
const DEFAULT_TRANSPARENT_CHAR = ".";
const DEFAULT_FONT_HEIGHT = 8;

const MIN_TEXTURE_SIDE = 1;
const MAX_TEXTURE_SIDE = 256;
const MIN_FONT_HEIGHT = 1;
const MAX_FONT_HEIGHT = 32;

function fail(message: string): never {
  throw new Error(`resourcepack: ${message}`);
}

function describe(value: unknown): string {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (value === undefined) {
    return "undefined";
  }
  if (value === null) {
    return "null";
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  return Array.isArray(value) ? "[array]" : "[object]";
}

/** Split a string into its Unicode code points (one entry per character). */
function codePoints(value: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < value.length;) {
    const cp = value.codePointAt(i) ?? 0;
    const ch = String.fromCodePoint(cp);
    out.push(ch);
    i += ch.length;
  }
  return out;
}

function codePointLength(value: string): number {
  return codePoints(value).length;
}

function at<T>(values: readonly T[], index: number, where: string): T {
  const value = values[index];
  if (value === undefined) {
    fail(`${where}: missing element at index ${index}`);
  }
  return value;
}

function toArray<T>(value: readonly T[] | undefined, where: string): readonly T[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    fail(`${where} must be an array, got ${describe(value)}`);
  }
  return value;
}

function assertNamespace(value: unknown, where: string, what: string): string {
  if (typeof value !== "string" || value.length === 0) {
    fail(`${where}: ${what} must be a non-empty string, got ${describe(value)}`);
  }
  if (!NAMESPACE_PATTERN.test(value)) {
    const reason = UPPERCASE_PATTERN.test(value)
      ? "uppercase characters are not allowed"
      : 'allowed characters are "a-z", "0-9", "_", "." and "-"';
    fail(`${where}: invalid ${what} ${JSON.stringify(value)}: ${reason}`);
  }
  return value;
}

function assertPath(value: unknown, where: string, what: string): string {
  if (typeof value !== "string" || value.length === 0) {
    fail(`${where}: ${what} must be a non-empty string, got ${describe(value)}`);
  }
  if (!PATH_PATTERN.test(value)) {
    const reason = UPPERCASE_PATTERN.test(value)
      ? "uppercase characters are not allowed"
      : 'allowed characters are "a-z", "0-9", "_", ".", "/" and "-"';
    fail(`${where}: invalid ${what} ${JSON.stringify(value)}: ${reason}`);
  }
  return value;
}

interface SplitId {
  hasNamespace: boolean;
  namespace: string;
  path: string;
}

function splitResourceId(id: unknown, where: string): SplitId {
  const ctx = `${where} (resource id ${describe(id)})`;
  if (typeof id !== "string" || id.length === 0) {
    fail(`${where}: resource id must be a non-empty string, got ${describe(id)}`);
  }
  const colonIndex = id.indexOf(":");
  if (colonIndex === -1) {
    assertPath(id, ctx, "path");
    return { hasNamespace: false, namespace: "", path: id };
  }
  const namespace = id.slice(0, colonIndex);
  const path = id.slice(colonIndex + 1);
  if (path.includes(":")) {
    fail(`${ctx}: resource id must contain at most one ":" separator`);
  }
  assertNamespace(namespace, ctx, "namespace");
  assertPath(path, ctx, "path");
  return { hasNamespace: true, namespace, path };
}

function resolveResourceId(id: unknown, packNamespace: string, where: string): string {
  const split = splitResourceId(id, where);
  if (split.hasNamespace) {
    return `${split.namespace}:${split.path}`;
  }
  return `${packNamespace}:${split.path}`;
}

function normalizeColor(value: unknown, where: string): string {
  if (typeof value !== "string") {
    fail(
      `${where}: color must be a string ("transparent", "#RRGGBB" or "#RRGGBBAA"), got ${describe(value)}`,
    );
  }
  // TODO: the spec does not state whether "transparent" is case-insensitive;
  // treated as case-sensitive.
  if (value === "transparent") {
    return value;
  }
  if (!COLOR_PATTERN.test(value)) {
    fail(
      `${where}: color must be "transparent", "#RRGGBB" or "#RRGGBBAA", got ${JSON.stringify(value)}`,
    );
  }
  return value;
}

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface PixelMapTextureInput {
  id: string;
  size?: readonly [number, number];
  palette: Readonly<Record<string, string>>;
  map: readonly string[];
  transparentChar?: string;
}

export interface PngTextureInput {
  id: string;
  source: { kind: "png"; path: string };
}

export type TextureInput = PixelMapTextureInput | PngTextureInput;

export interface TextureDef {
  kind: "texture";
  id: string;
  pixelMap?: {
    size: readonly [number, number];
    palette: Readonly<Record<string, string>>;
    map: readonly string[];
    transparentChar: string;
  };
  pngPath?: string;
}

type PixelMapDef = NonNullable<TextureDef["pixelMap"]>;

export interface ItemInput {
  id: string;
  baseItem: string;
  displayName?: string;
  texture?: TextureDef | string;
  model?: string;
  modelParent?: string;
  /**
   * Explicit CustomModelData number request (RP-2). When omitted the
   * build allocates the next registry number (append-only). An
   * explicit number that collides with another item's allocation —
   * including a number reserved by a since-deleted definition — is a
   * build error.
   */
  customModelData?: number;
}

export interface ItemDef {
  kind: "item";
  id: string;
  baseItem: string;
  displayName?: string;
  texture?: TextureDef | string;
  model?: string;
  modelParent?: string;
  customModelData?: number;
}

export interface FontCharInput {
  id: string;
  texture: TextureDef | string;
  char: string;
  height?: number;
  ascent: number;
}

export interface FontCharDef {
  kind: "fontChar";
  id: string;
  texture: TextureDef | string;
  char: string;
  height: number;
  ascent: number;
}

export interface PackInput {
  namespace: string;
  description: string;
  required?: boolean;
  textures?: readonly TextureDef[];
  items?: readonly ItemDef[];
  fontChars?: readonly FontCharDef[];
}

export interface PackDef {
  kind: "resourcepack";
  namespace: string;
  description: string;
  required: boolean;
  textures: readonly TextureDef[];
  items: readonly ItemDef[];
  fontChars: readonly FontCharDef[];
}

export interface ResourceId {
  namespace: string;
  path: string;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function assertTextureSide(value: unknown, name: "width" | "height", where: string): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < MIN_TEXTURE_SIDE ||
    value > MAX_TEXTURE_SIDE
  ) {
    fail(
      `${where}: size ${name} must be an integer between ${MIN_TEXTURE_SIDE} and ${MAX_TEXTURE_SIDE}, got ${describe(value)}`,
    );
  }
  return value;
}

function normalizePixelMap(input: PixelMapTextureInput, where: string): PixelMapDef {
  const sizeRaw: unknown = input.size ?? DEFAULT_TEXTURE_SIZE;
  if (!Array.isArray(sizeRaw) || sizeRaw.length !== 2) {
    fail(`${where}: size must be a [width, height] pair, got ${describe(input.size)}`);
  }
  const width = assertTextureSide(sizeRaw[0], "width", where);
  const height = assertTextureSide(sizeRaw[1], "height", where);

  const paletteRaw: unknown = input.palette;
  if (paletteRaw === null || typeof paletteRaw !== "object" || Array.isArray(paletteRaw)) {
    fail(
      `${where}: palette must be an object mapping single characters to colors, got ${describe(paletteRaw)}`,
    );
  }
  const palette: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(paletteRaw as Record<string, unknown>)) {
    if (codePointLength(key) !== 1) {
      fail(
        `${where}: palette key ${JSON.stringify(key)} must be exactly one character (code point)`,
      );
    }
    palette[key] = normalizeColor(rawValue, `${where}: palette[${JSON.stringify(key)}]`);
  }

  const transparentCharRaw: unknown = input.transparentChar ?? DEFAULT_TRANSPARENT_CHAR;
  if (typeof transparentCharRaw !== "string" || codePointLength(transparentCharRaw) !== 1) {
    fail(
      `${where}: transparentChar must be exactly one character (code point), got ${describe(input.transparentChar)}`,
    );
  }
  const transparentChar = transparentCharRaw;
  const transparentValue = palette[transparentChar];
  if (transparentValue !== undefined && transparentValue !== "transparent") {
    fail(
      `${where}: transparentChar ${JSON.stringify(transparentChar)} maps to ${JSON.stringify(
        transparentValue,
      )} in palette but must map to "transparent"`,
    );
  }

  const mapRaw: unknown = input.map;
  if (!Array.isArray(mapRaw)) {
    fail(`${where}: map must be an array of strings (one string per row), got ${describe(mapRaw)}`);
  }
  const rows: readonly unknown[] = mapRaw;
  if (rows.length !== height) {
    fail(`${where}: map has ${rows.length} row(s) but size height is ${height}`);
  }

  const normalizedRows: string[] = [];
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    if (typeof row !== "string") {
      fail(
        `${where}: map line ${rowIndex + 1} (index ${rowIndex}) must be a string, got ${describe(row)}`,
      );
    }
    const cells = codePoints(row);
    if (cells.length !== width) {
      fail(
        `${where}: map line ${rowIndex + 1} (index ${rowIndex}) has ${cells.length} character(s) but size width is ${width}`,
      );
    }
    for (let columnIndex = 0; columnIndex < cells.length; columnIndex++) {
      const cell = cells[columnIndex];
      if (cell === undefined) {
        continue;
      }
      if (palette[cell] === undefined) {
        fail(
          `${where}: map line ${rowIndex + 1} (index ${rowIndex}), column ${columnIndex + 1} (index ${columnIndex}): ` +
            `character ${JSON.stringify(cell)} is not defined in palette`,
        );
      }
    }
    normalizedRows.push(row);
  }

  return {
    size: [width, height],
    palette,
    map: normalizedRows,
    transparentChar,
  };
}

function normalizeTextureRef(ref: TextureDef | string, where: string): TextureDef | string {
  if (typeof ref === "string") {
    if (ref.length === 0) {
      fail(`${where}: texture id must be a non-empty string`);
    }
    splitResourceId(ref, where);
    return ref;
  }
  const value: unknown = ref;
  if (value === null || typeof value !== "object") {
    fail(
      `${where}: texture must be a TextureDef object or a texture id string, got ${describe(value)}`,
    );
  }
  const texture = value as TextureDef;
  if (texture.kind !== "texture") {
    fail(`${where}: texture object kind must be "texture", got ${describe(texture.kind)}`);
  }
  splitResourceId(texture.id, `${where} (inline TextureDef)`);
  // TODO: inline TextureDef contents (pixelMap / pngPath) are not re-validated;
  // callers are expected to build them through defineTexture().
  return texture;
}

/* ------------------------------------------------------------------ */
/* defineTexture                                                       */
/* ------------------------------------------------------------------ */

export function defineTexture(input: TextureInput): TextureDef {
  if (input === null || typeof input !== "object") {
    fail(`defineTexture: input must be an object, got ${describe(input)}`);
  }
  const id: unknown = input.id;
  const where = `defineTexture(id=${describe(id)})`;
  splitResourceId(id, `${where}: id`);
  const textureId = id as string;

  if ("source" in input) {
    const source: unknown = input.source;
    if (source === null || typeof source !== "object") {
      fail(
        `${where}: source must be an object with kind "png" and a path, got ${describe(source)}`,
      );
    }
    const typedSource = source as { kind?: unknown; path?: unknown };
    if (typedSource.kind !== "png") {
      fail(`${where}: source.kind must be "png", got ${describe(typedSource.kind)}`);
    }
    const pngPath = typedSource.path;
    if (typeof pngPath !== "string" || pngPath.length === 0) {
      fail(`${where}: source.path must be a non-empty string, got ${describe(pngPath)}`);
    }
    if (!PNG_SUFFIX_PATTERN.test(pngPath)) {
      fail(
        `${where}: source.path must end with ".png" (case-insensitive), got ${JSON.stringify(pngPath)}`,
      );
    }
    return { kind: "texture", id: textureId, pngPath };
  }

  const pixelMap = normalizePixelMap(input as PixelMapTextureInput, where);
  return { kind: "texture", id: textureId, pixelMap };
}

/* ------------------------------------------------------------------ */
/* defineItem                                                          */
/* ------------------------------------------------------------------ */

export function defineItem(input: ItemInput): ItemDef {
  if (input === null || typeof input !== "object") {
    fail(`defineItem: input must be an object, got ${describe(input)}`);
  }
  const id: unknown = input.id;
  const where = `defineItem(id=${describe(id)})`;
  splitResourceId(id, `${where}: id`);
  const itemId = id as string;

  const baseItem: unknown = input.baseItem;
  if (typeof baseItem !== "string" || baseItem.length === 0) {
    fail(`${where}: baseItem must be a non-empty resource id, got ${describe(baseItem)}`);
  }
  splitResourceId(baseItem, `${where}: baseItem`);

  const textureRef: unknown = input.texture;
  const model: unknown = input.model;
  if (textureRef === undefined && model === undefined) {
    fail(`${where}: either "texture" or "model" must be provided`);
  }

  const normalizedTexture =
    textureRef === undefined
      ? undefined
      : normalizeTextureRef(textureRef as TextureDef | string, `${where}: texture`);

  if (model !== undefined) {
    if (typeof model !== "string" || model.length === 0) {
      fail(`${where}: model must be a non-empty string, got ${describe(model)}`);
    }
    // Model ids land verbatim in the generated item definition JSON, so
    // they obey the same resource id rules as everything else.
    splitResourceId(model, `${where}: model`);
  }

  const modelParent: unknown = input.modelParent;
  if (modelParent !== undefined) {
    if (typeof modelParent !== "string" || modelParent.length === 0) {
      fail(`${where}: modelParent must be a non-empty string, got ${describe(modelParent)}`);
    }
    splitResourceId(modelParent, `${where}: modelParent`);
  }

  const displayName: unknown = input.displayName;
  if (displayName !== undefined && typeof displayName !== "string") {
    fail(`${where}: displayName must be a string, got ${describe(displayName)}`);
  }

  const customModelData: unknown = input.customModelData;
  if (customModelData !== undefined) {
    if (
      typeof customModelData !== "number" ||
      !Number.isInteger(customModelData) ||
      customModelData < 1
    ) {
      fail(
        `${where}: customModelData must be a positive integer, got ${describe(customModelData)}`,
      );
    }
  }

  const def: ItemDef = { kind: "item", id: itemId, baseItem };
  if (displayName !== undefined) {
    def.displayName = displayName;
  }
  if (customModelData !== undefined) {
    def.customModelData = customModelData as number;
  }
  if (normalizedTexture !== undefined) {
    def.texture = normalizedTexture;
  }
  if (model !== undefined) {
    def.model = model;
  }
  if (modelParent !== undefined) {
    def.modelParent = modelParent;
  }
  return def;
}

/* ------------------------------------------------------------------ */
/* defineFontChar                                                      */
/* ------------------------------------------------------------------ */

export function defineFontChar(input: FontCharInput): FontCharDef {
  if (input === null || typeof input !== "object") {
    fail(`defineFontChar: input must be an object, got ${describe(input)}`);
  }
  const id: unknown = input.id;
  const where = `defineFontChar(id=${describe(id)})`;
  splitResourceId(id, `${where}: id`);
  const fontCharId = id as string;

  const texture: unknown = input.texture;
  if (texture === undefined) {
    fail(`${where}: texture is required (TextureDef object or texture id string)`);
  }
  const normalizedTexture = normalizeTextureRef(
    texture as TextureDef | string,
    `${where}: texture`,
  );

  const charRaw: unknown = input.char;
  if (typeof charRaw !== "string" || codePointLength(charRaw) !== 1) {
    fail(`${where}: char must be exactly one code point, got ${describe(charRaw)}`);
  }
  const char = charRaw;

  const heightRaw: unknown = input.height ?? DEFAULT_FONT_HEIGHT;
  if (
    typeof heightRaw !== "number" ||
    !Number.isInteger(heightRaw) ||
    heightRaw < MIN_FONT_HEIGHT ||
    heightRaw > MAX_FONT_HEIGHT
  ) {
    fail(
      `${where}: height must be an integer between ${MIN_FONT_HEIGHT} and ${MAX_FONT_HEIGHT}, got ${describe(heightRaw)}`,
    );
  }
  const height = heightRaw;

  const ascentRaw: unknown = input.ascent;
  if (
    typeof ascentRaw !== "number" ||
    !Number.isInteger(ascentRaw) ||
    ascentRaw < 0 ||
    ascentRaw > height
  ) {
    fail(
      `${where}: ascent is required and must be an integer between 0 and height (${height}), got ${describe(ascentRaw)}`,
    );
  }
  const ascent = ascentRaw;

  return {
    kind: "fontChar",
    id: fontCharId,
    texture: normalizedTexture,
    char,
    height,
    ascent,
  };
}

/* ------------------------------------------------------------------ */
/* definePack                                                          */
/* ------------------------------------------------------------------ */

export function definePack(input: PackInput): PackDef {
  if (input === null || typeof input !== "object") {
    fail(`definePack: input must be an object, got ${describe(input)}`);
  }

  const namespace = assertNamespace(input.namespace, "definePack", "namespace");
  const base = `definePack(namespace=${JSON.stringify(namespace)})`;

  const description: unknown = input.description;
  if (typeof description !== "string" || description.length === 0) {
    fail(`${base}: description must be a non-empty string, got ${describe(description)}`);
  }

  const requiredRaw: unknown = input.required ?? false;
  if (typeof requiredRaw !== "boolean") {
    fail(`${base}: required must be a boolean, got ${describe(requiredRaw)}`);
  }
  const required = requiredRaw;

  const textureList = toArray(input.textures, `${base}: textures`);
  const itemList = toArray(input.items, `${base}: items`);
  const fontCharList = toArray(input.fontChars, `${base}: fontChars`);

  // --- textures: validate kind + id, reject duplicates -----------------
  const textureIds = new Map<string, string>();
  for (let index = 0; index < textureList.length; index++) {
    const texture = at(textureList, index, `${base}: textures`);
    if (texture.kind !== "texture") {
      fail(`${base}: textures[${index}].kind must be "texture", got ${describe(texture.kind)}`);
    }
    const resolved = resolveResourceId(texture.id, namespace, `${base}: textures[${index}].id`);
    const previous = textureIds.get(resolved);
    if (previous !== undefined) {
      fail(
        `${base}: duplicate texture id at textures[${index}].id ${JSON.stringify(texture.id)}: ` +
          `${JSON.stringify(resolved)} is already declared by textures entry with id ${JSON.stringify(previous)}`,
      );
    }
    textureIds.set(resolved, texture.id);
  }

  // --- items: validate kind + id, reject duplicates, check refs -------
  const itemIds = new Map<string, string>();
  for (let index = 0; index < itemList.length; index++) {
    const item = at(itemList, index, `${base}: items`);
    if (item.kind !== "item") {
      fail(`${base}: items[${index}].kind must be "item", got ${describe(item.kind)}`);
    }
    const resolved = resolveResourceId(item.id, namespace, `${base}: items[${index}].id`);
    const previous = itemIds.get(resolved);
    if (previous !== undefined) {
      fail(
        `${base}: duplicate item id at items[${index}].id ${JSON.stringify(item.id)}: ` +
          `${JSON.stringify(resolved)} is already declared by item with id ${JSON.stringify(previous)}`,
      );
    }
    itemIds.set(resolved, item.id);

    const textureRef: unknown = item.texture;
    if (typeof textureRef === "string") {
      const textureResolved = resolveResourceId(
        textureRef,
        namespace,
        `${base}: items[${index}].texture`,
      );
      if (!textureIds.has(textureResolved)) {
        fail(
          `${base}: items[${index}].texture references unknown texture id ${JSON.stringify(textureRef)} ` +
            `(resolved to ${JSON.stringify(textureResolved)}); declare it in the pack "textures" array`,
        );
      }
    }
  }

  // --- fontChars: validate kind + id, reject duplicate ids and chars --
  const fontCharIds = new Map<string, string>();
  const fontCharByChar = new Map<string, string>();
  for (let index = 0; index < fontCharList.length; index++) {
    const fontChar = at(fontCharList, index, `${base}: fontChars`);
    if (fontChar.kind !== "fontChar") {
      fail(`${base}: fontChars[${index}].kind must be "fontChar", got ${describe(fontChar.kind)}`);
    }
    const resolved = resolveResourceId(fontChar.id, namespace, `${base}: fontChars[${index}].id`);
    const previousId = fontCharIds.get(resolved);
    if (previousId !== undefined) {
      fail(
        `${base}: duplicate font character id at fontChars[${index}].id ${JSON.stringify(fontChar.id)}: ` +
          `${JSON.stringify(resolved)} is already declared by font character with id ${JSON.stringify(previousId)}`,
      );
    }
    fontCharIds.set(resolved, fontChar.id);

    const previousChar = fontCharByChar.get(fontChar.char);
    if (previousChar !== undefined) {
      fail(
        `${base}: duplicate font character char ${JSON.stringify(fontChar.char)} at fontChars[${index}].char: ` +
          `already used by font character ${JSON.stringify(previousChar)}`,
      );
    }
    fontCharByChar.set(fontChar.char, fontChar.id);

    const textureRef: unknown = fontChar.texture;
    if (typeof textureRef === "string") {
      const textureResolved = resolveResourceId(
        textureRef,
        namespace,
        `${base}: fontChars[${index}].texture`,
      );
      if (!textureIds.has(textureResolved)) {
        fail(
          `${base}: fontChars[${index}].texture references unknown texture id ${JSON.stringify(textureRef)} ` +
            `(resolved to ${JSON.stringify(textureResolved)}); declare it in the pack "textures" array`,
        );
      }
    }
  }

  return {
    kind: "resourcepack",
    namespace,
    description,
    required,
    textures: textureList,
    items: itemList,
    fontChars: fontCharList,
  };
}

/* ------------------------------------------------------------------ */
/* parseResourceId                                                     */
/* ------------------------------------------------------------------ */

export function parseResourceId(id: string, defaultNamespace: string): ResourceId {
  const where = `parseResourceId(${JSON.stringify(id)})`;
  const split = splitResourceId(id, where);
  if (split.hasNamespace) {
    return { namespace: split.namespace, path: split.path };
  }
  const namespace = assertNamespace(defaultNamespace, where, "defaultNamespace");
  return { namespace, path: split.path };
}
