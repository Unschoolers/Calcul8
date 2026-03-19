import { defineConfig } from "vitest/config";

const maxWorkers = Number(process.env.VITEST_MAX_WORKERS || "");

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "tests/**/*.test.ts",
      "apps/api/src/lib/**/*.test.ts"
    ],
    exclude: [
      "**/dist/**",
      "**/node_modules/**"
    ],
    fileParallelism: true,
    maxWorkers: Number.isFinite(maxWorkers) && maxWorkers > 0 ? maxWorkers : undefined
  }
});
