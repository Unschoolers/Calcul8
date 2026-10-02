import { defineConfig, mergeConfig } from "vite";
import appConfig from "../../vite.config.ts";

export default mergeConfig(appConfig, defineConfig({
  build: {
    outDir: ".cache/shopify-polish-vite",
    emptyOutDir: true,
    rollupOptions: {
      input: "tests/visual/fixtures/shopify.html"
    }
  }
}));
