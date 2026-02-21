import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "src/lib/**/*.test.ts",
      "src/functions/**/*.test.ts"
    ],
    exclude: [
      "**/dist/**",
      "**/node_modules/**"
    ],
    fileParallelism: false
  }
});
