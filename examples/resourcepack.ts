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

// A UI glyph: the coin texture bound to a private-use character in
// the pack's own font (example:default).
export const coinChar = defineFontChar({
  id: "ui/coin_icon",
  texture: coinTexture,
  char: "\uE000",
  height: 8,
  ascent: 7,
});

export const resourcePack = definePack({
  namespace: "example",
  description: "Example resource pack",
  textures: [gemTexture, coinTexture],
  items: [gemItem],
  fontChars: [coinChar],
});
