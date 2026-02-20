import { createApp } from "vue";
import "vuetify/styles";
import "./styles/app.css";
import { appOptions } from "./app.ts";
import { vuetify } from "./vuetify.ts";

const splashShownAt = performance.now();
const app = createApp(appOptions);
app.use(vuetify).mount("#app");

const MIN_SPLASH_MS = 800;
const MIN_RICH_SPLASH_MS = 350;
const elapsedMs = performance.now() - splashShownAt;
const delayMs = Math.max(0, MIN_SPLASH_MS - elapsedMs);

const pageLoadedPromise = new Promise<void>((resolve) => {
  if (document.readyState === "complete") {
    resolve();
    return;
  }
  window.addEventListener("load", () => resolve(), { once: true });
});

const minSplashPromise = new Promise<void>((resolve) => {
  window.setTimeout(() => resolve(), delayMs);
});

void (async () => {
  await pageLoadedPromise;
  document.body.classList.add("splash-rich");
  const richSplashShownAt = performance.now();

  await minSplashPromise;
  const richElapsedMs = performance.now() - richSplashShownAt;
  if (richElapsedMs < MIN_RICH_SPLASH_MS) {
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, MIN_RICH_SPLASH_MS - richElapsedMs);
    });
  }

  document.getElementById("app")?.removeAttribute("v-cloak");
  document.body.classList.add("app-ready");
  window.setTimeout(() => {
    const splash = document.getElementById("startup-splash");
    if (splash) splash.remove();
  }, 240);
})();
