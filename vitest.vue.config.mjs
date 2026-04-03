import { createVitestConfig } from "./vitest.shared.mjs";

export default createVitestConfig({
  useVue: true,
  include: [
    "tests/template-compile.test.ts",
    "tests/wheel-window.test.ts"
  ]
});
