import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vuetify from "vite-plugin-vuetify";
import packageJson from "./package.json";

const appVersion = packageJson.version ?? "0.0.0";

export default defineConfig({
  base: "./",
  define: {
    __APP_VERSION__: JSON.stringify(appVersion)
  },
  plugins: [
    vue(),
    vuetify({
      autoImport: true
    })
  ],
  build: {
    target: "es2019",
    sourcemap: false,
    minify: "esbuild",
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      input: {
        main: "index.html",
        spectator: "spectator.html"
      },
      output: {
        manualChunks(id) {
          if (id.includes("/src/components/windows/whatnot/")) return "whatnot-ui";
          if (id.includes("/src/components/windows/live/") || id.includes("/src/components/windows/LiveWindow")) return "live-ui";
          if (id.includes("/src/components/windows/Wheel") || id.includes("/src/components/windows/wheel")) return "wheel-ui";
          if (id.includes("/src/components/windows/Singles") || id.includes("/src/components/windows/singles/")) return "singles-ui";
          if (id.includes("/src/components/windows/Portfolio") || id.includes("/src/components/windows/portfolio")) return "portfolio-ui";
          if (id.includes("/src/components/windows/Sales") || id.includes("/src/components/windows/sales")) return "sales-ui";
          if (id.includes("/src/components/windows/Config") || id.includes("/src/components/modals/AutoCalculateModal")) return "config-ui";
          if (id.includes("/src/components/LivePriceCard")) return "live-price-card";
          if (id.includes("/src/app-core/computed") || id.includes("/src/app-core/methods") || id.includes("/src/app-core/watch") || id.includes("/src/app-core/lifecycle") || id.includes("/src/app-core/state")) {
            return "app-core";
          }

          if (!id.includes("node_modules")) return;
          if (id.includes("vuetify")) return "vuetify";
          if (id.includes("chart.js")) return "chartjs";
          return "vendor";
        }
      }
    }
  }
});
