import { defineConfig, devices } from "@playwright/test";

const port = 4178;
const baseURL = `http://127.0.0.1:${port}`;
const executablePath = process.env.SHOPIFY_PLAYWRIGHT_EXECUTABLE_PATH || undefined;

export default defineConfig({
  testDir: "./tests/visual",
  testMatch: "shopify-production-polish.spec.ts",
  outputDir: "./test-results/shopify-polish",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    launchOptions: executablePath ? { executablePath, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] } : undefined,
    trace: "retain-on-failure",
    screenshot: "off",
    video: "off"
  },
  webServer: {
    command: `node ./node_modules/vite/bin/vite.js build --config tests/visual/vite.shopify.config.ts && node ./node_modules/vite/bin/vite.js preview --config tests/visual/vite.shopify.config.ts --host 127.0.0.1 --port ${port}`,
    url: `${baseURL}/tests/visual/fixtures/shopify.html`,
    reuseExistingServer: false,
    timeout: 120_000
  }
});
