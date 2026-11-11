import { defineConfig } from "vite-plus";

export default defineConfig({
  // Oxfmt (via `vp fmt`). Options follow the Prettier-compatible
  // defaults; the codebase is written in that style (double quotes,
  // semicolons, trailing commas), so only deviations are normalized.
  fmt: {},
  // Oxlint (via `vp lint`). Type-aware linting and type checking run
  // through tsgolint, so `vp check` covers format, lint, and types.
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
    rules: {
      // The builder API models Skript's if/then structure with AST
      // nodes that carry a literal `then` branch field; they are not
      // promises, so this rule is a false positive by design here.
      "unicorn/no-thenable": "off",
    },
  },
});
