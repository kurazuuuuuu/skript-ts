// Resource pack definitions (RP-1: pack generation foundation).
//
// This module exports no Script, so the build skips it as a script
// file — but the exported PackDef makes `skript-ts build` generate
// `example.zip` and `example.resourcepack.json` (the manifest) into
// the build output directory. Dropping the zip into a client's
// resourcepacks folder applies the textures; the custom item shows
// when a stack carries the matching item_model component, e.g.
//   /give @s minecraft:amethyst_shard[item_model="example:gem"]
// Sending the pack to players automatically is a later phase.

import { defineFontChar, defineItem, definePack, defineTexture } from "../src/index.js";

// A 16x16 gem drawn as a pixel map (palette + character map).
export const gemTexture = defineTexture({
  id: "item/gem",
  palette: {
    ".": "transparent",
    k: "#1B2A3AFF",
    a: "#E8F4FFFF",
    b: "#7FB2E5FF",
    c: "#3D6FA8FF",
  },
  map: [
    "................",
    "................",
    "......kkkk......",
    ".....kabbbk.....",
    "....kabbbbbk....",
    "...kabbbbbbbk...",
    "..kabbbcbbbbbk..",
    "..kabbbbcbbbbk..",
    "..kbbbbbcbbbbk..",
    "...kbbbbbbbbk...",
    "....kbbbbbbk....",
    ".....kbbbbk.....",
    "......kbbk......",
    ".......kk.......",
    "................",
    "................",
  ],
});

export const gemItem = defineItem({
  id: "gem",
  baseItem: "minecraft:amethyst_shard",
  displayName: "ジェム",
  texture: gemTexture,
});

// A texture taken from a PNG file instead of a pixel map. The path
// resolves against this file's directory.
export const coinTexture = defineTexture({
  id: "ui/coin",
  source: { kind: "png", path: "./art/coin.png" },
});

// A UI glyph: the coin texture bound to a character in the pack's
// own font (example:default). No char is written here (RP-4): the
// project build auto-allocates a private-use character from the
// persisted fontchar-registry.json — on first build this entry
// receives U+E000, exactly the char it used to spell out.
export const coinChar = defineFontChar({
  id: "ui/coin_icon",
  texture: coinTexture,
  height: 8,
  ascent: 7,
});

// A second auto-allocated glyph: the gem texture as a UI icon.
// It receives the next private-use character after the coin
// (U+E001 on a fresh registry).
export const gemIconChar = defineFontChar({
  id: "ui/gem_icon",
  texture: gemTexture,
  height: 8,
  ascent: 7,
});

// An explicitly-charred glyph: the definition pins its character
// instead of taking an auto-allocation. The build records it in
// the registry and rejects any other glyph claiming U+E100.
export const starChar = defineFontChar({
  id: "ui/star_icon",
  texture: coinTexture,
  char: "\uE100",
  height: 8,
  ascent: 7,
});

export const resourcePack = definePack({
  namespace: "example",
  description: "Example resource pack",
  textures: [gemTexture, coinTexture],
  items: [gemItem],
  fontChars: [coinChar, gemIconChar, starChar],
});
