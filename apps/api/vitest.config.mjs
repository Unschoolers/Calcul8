import { defineConfig } from "vitest/config";

const maxWorkers = Number(process.env.VITEST_MAX_WORKERS || "");

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/lib/**/*.test.ts", "src/functions/**/*.test.ts", "src/features/**/*.test.ts"],
    exclude: ["**/dist/**", "**/node_modules/**"],
    fileParallelism: true,
    maxWorkers: Number.isFinite(maxWorkers) && maxWorkers > 0 ? maxWorkers : undefined,
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json-summary"],
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
