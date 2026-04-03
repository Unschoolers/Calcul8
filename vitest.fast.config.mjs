import { createVitestConfig } from "./vitest.shared.mjs";

export default createVitestConfig({
  useVue: false,
  include: ["tests/**/*.test.ts"],
  exclude: [
    "**/dist/**",
    "**/node_modules/**",
    "tests/template-compile.test.ts",
    "tests/wheel-window.test.ts"
  ]
});
