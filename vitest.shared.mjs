import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

const maxWorkers = Number(process.env.VITEST_MAX_WORKERS || "");

export function createVitestConfig({
  useVue = true,
  include = ["tests/**/*.test.ts"],
  exclude = ["**/dist/**", "**/node_modules/**"]
} = {}) {
  return defineConfig({
    plugins: useVue ? [vue()] : [],
    test: {
      environment: "node",
      include,
      exclude,
      fileParallelism: true,
      maxWorkers: Number.isFinite(maxWorkers) && maxWorkers > 0 ? maxWorkers : undefined,
      coverage: {
        provider: "v8",
        reporter: ["text", "text-summary", "json-summary", "html", "lcov"],
        reportsDirectory: "coverage",
        include: ["src/**/*.ts"],
        exclude: [
          "**/*.test.ts",
          "**/dist/**",
          "**/node_modules/**"
        ]
      }
    }
  });
}
