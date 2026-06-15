import { defineConfig, devices } from "@playwright/test";

const port = 4177;
const baseURL = `http://127.0.0.1:${port}`;
const manageWebServer = process.env.VISUAL_SMOKE_SKIP_WEBSERVER !== "1";

export default defineConfig({
  testDir: "./tests/visual",
  outputDir: "./test-results/playwright",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]]
    : "list",
  use: {
    baseURL,
    trace: "off",
    screenshot: "off",
    video: "off"
  },
  webServer: manageWebServer ? {
    command: `node ./node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${port}`,
    url: `${baseURL}/nologin`,
    reuseExistingServer: false,
    gracefulShutdown: { signal: "SIGTERM", timeout: 500 },
    timeout: 120_000
  } : undefined,
  projects: [
    {
      name: "desktop-smoke",
      use: {
        ...devices["Desktop Chrome"],
        colorScheme: "light",
        viewport: { width: 1366, height: 900 }
      }
    },
    {
      name: "mobile-smoke",
      use: {
        ...devices["Pixel 7"],
        colorScheme: "dark",
        viewport: { width: 412, height: 915 }
      }
    }
  ]
});
