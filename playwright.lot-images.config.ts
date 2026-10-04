import config from "./playwright.config.ts";

// Bundle shared CommonJS contracts before browser checks. Development mode keeps
// the existing /nologin test route available without a merchant account.
export default {
  ...config,
  testMatch: "**/lot-images.spec.ts",
  webServer: {
    command: "NODE_ENV=development node ./node_modules/vite/bin/vite.js build --outDir .cache/lot-images-vite && node ./node_modules/vite/bin/vite.js preview --outDir .cache/lot-images-vite --host 127.0.0.1 --port 4177",
    url: "http://127.0.0.1:4177/nologin",
    reuseExistingServer: false,
    timeout: 120_000
  }
};
