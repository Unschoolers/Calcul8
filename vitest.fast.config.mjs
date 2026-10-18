import { createVitestConfig } from "./vitest.shared.mjs";

export default createVitestConfig({
  // Fast unit tests still import Vue SFCs in Node; the plugin is needed to
  // transform those modules even though this suite does not mount components.
  useVue: true,
  include: ["tests/**/*.test.ts"],
  exclude: [
    "**/dist/**",
    "**/node_modules/**",
    "tests/template-compile.test.ts",
    "tests/wheel-window.test.ts",
    "tests/vue/**/*.scenario.test.ts"
  ]
});
