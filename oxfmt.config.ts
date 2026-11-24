import { defineConfig } from "oxfmt";

export default defineConfig({
  printWidth: 100,
  semi: true,
  singleQuote: false,
  trailingComma: "all",
  ignorePatterns: [
    "**/dist/**",
    "**/node_modules/**",
    "pnpm-lock.yaml",
    "apps/web/src/components/graphical/**",
    ".agents/**",
    "gui/**",
    "GUI.md",
  ],
});
