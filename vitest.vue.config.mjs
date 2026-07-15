import { createVitestConfig } from "./vitest.shared.mjs";

export default createVitestConfig({
  useVue: true,
  include: [
    "tests/template-compile.test.ts",
    "tests/wheel-window.test.ts",
    "tests/vue/**/*.scenario.test.ts"
  ],
  exclude: ["**/dist/**", "**/node_modules/**"],
  environment: "jsdom",
  setupFiles: ["tests/vue/setup.ts"],
  inlineDeps: ["vuetify"]
});
