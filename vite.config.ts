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
  resolve: {
    alias: {
      vue: "vue/dist/vue.esm-bundler.js"
    }
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
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("vuetify")) return "vuetify";
          if (id.includes("chart.js")) return "chartjs";
          return "vendor";
        }
      }
    }
  }
});
