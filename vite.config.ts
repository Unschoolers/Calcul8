import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vuetify from "vite-plugin-vuetify";

export default defineConfig({
  base: "./",
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
    minify: "esbuild"
  }
});
