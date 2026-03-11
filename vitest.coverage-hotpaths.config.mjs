import { defineConfig } from "vitest/config";
import baseConfig from "./vitest.config.mjs";

const maxWorkers = Number(process.env.VITEST_MAX_WORKERS || "");

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    fileParallelism: true,
    maxWorkers: Number.isFinite(maxWorkers) && maxWorkers > 0 ? maxWorkers : undefined,
    coverage: {
      ...baseConfig.test.coverage,
      reporter: ["text-summary", "json-summary"]
    }
  }
});
