import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

const maxWorkers = Number(process.env.VITEST_MAX_WORKERS || "");

export default defineConfig({
  plugins: [vue()],
  test: {
    fileParallelism: true,
    maxWorkers: Number.isFinite(maxWorkers) && maxWorkers > 0 ? maxWorkers : undefined,
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "json-summary", "html", "lcov"],
      reportsDirectory: "coverage",
      include: ["src/**/*.{ts,vue}"],
      exclude: ["**/*.test.ts", "**/*.d.ts", "**/dist/**", "**/node_modules/**"],
      thresholds: {
        statements: 76,
        branches: 66,
        functions: 80,
        lines: 79
      }
    },
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          include: ["tests/**/*.test.ts"],
          exclude: [
            "**/dist/**",
            "**/node_modules/**",
            "tests/template-compile.test.ts",
            "tests/wheel-window.test.ts",
            "tests/vue/**/*.scenario.test.ts"
          ],
          environment: "node"
        }
      },
      {
        extends: true,
        test: {
          name: "vue",
          include: [
            "tests/template-compile.test.ts",
            "tests/wheel-window.test.ts",
            "tests/vue/**/*.scenario.test.ts"
          ],
          exclude: ["**/dist/**", "**/node_modules/**"],
          environment: "jsdom",
          setupFiles: ["tests/vue/setup.ts"],
          server: { deps: { inline: ["vuetify"] } },
          css: { include: [/AppFormLayout\.css/] }
        }
      }
    ]
  }
});
