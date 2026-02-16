import { createApp } from "vue";
import "vuetify/styles";
import { appOptions } from "./app.ts";
import { vuetify } from "./vuetify.ts";

const splashShownAt = performance.now();
const app = createApp(appOptions);
app.use(vuetify).mount("#app");

const MIN_SPLASH_MS = 800;
const elapsedMs = performance.now() - splashShownAt;
const delayMs = Math.max(0, MIN_SPLASH_MS - elapsedMs);

window.setTimeout(() => {
  document.body.classList.add("app-ready");
  window.setTimeout(() => {
    const splash = document.getElementById("startup-splash");
    if (splash) splash.remove();
  }, 240);
}, delayMs);
