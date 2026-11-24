import { defineConfig } from "oxlint";

export default defineConfig({
  plugins: ["typescript", "unicorn", "react", "import", "vitest"],
  categories: {
    correctness: "error",
    suspicious: "warn",
  },
  env: {
    browser: true,
    es2024: true,
  },
  rules: {
    "no-console": ["error", { allow: ["warn", "error"] }],
    "typescript/no-explicit-any": "error",
    "react/react-in-jsx-scope": "off",
    // Effect's `_tag` discriminant and the `_exhaustive: never` pattern are intentional.
    "no-underscore-dangle": "off",
    "import/no-unassigned-import": ["warn", { allow: ["**/*.css"] }],
    // @effect/vitest test blocks.
    "vitest/no-standalone-expect": [
      "error",
      { additionalTestBlockFunctions: ["it.effect", "it.scoped", "it.live", "it.scopedLive"] },
    ],
  },
  ignorePatterns: [
    "**/dist/**",
    "**/node_modules/**",
    "**/.alchemy/**",
    "apps/web/src/components/graphical/**",
    ".agents/**",
    "gui/**",
  ],
});
