import { createApp } from "vue";
import "vuetify/styles";
import "driver.js/dist/driver.css";
import "./styles/app.css";
import App from "./App.vue";
import { vuetify } from "./vuetify.ts";

type RuntimeDebugEntry = {
  time: string;
  type: "vue-error" | "vue-warn" | "window-error" | "unhandled-rejection" | "mount-error";
  message: string;
  details?: unknown;
};

type RuntimeDebugWindow = Window & {
  __whatfeesRuntimeDebug?: RuntimeDebugEntry[];
};

function shouldEnableRuntimeDebug(): boolean {
  if (import.meta.env.DEV) return true;
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get("debugRuntime") === "1") return true;
    return localStorage.getItem("whatfees_debug_runtime") === "1";
  } catch {
    return false;
  }
}

function getComponentName(instance: unknown): string {
  const candidate = instance as {
    type?: { name?: string; __name?: string };
    $options?: { name?: string };
  } | null;
  return candidate?.type?.name
    || candidate?.type?.__name
    || candidate?.$options?.name
    || "anonymous";
}

function installRuntimeDebugHooks(app: ReturnType<typeof createApp>): void {
  if (!shouldEnableRuntimeDebug()) return;

  const debugWindow = window as RuntimeDebugWindow;
  debugWindow.__whatfeesRuntimeDebug = debugWindow.__whatfeesRuntimeDebug || [];

  const pushEntry = (entry: RuntimeDebugEntry) => {
    debugWindow.__whatfeesRuntimeDebug!.push(entry);
    if (debugWindow.__whatfeesRuntimeDebug!.length > 40) {
      debugWindow.__whatfeesRuntimeDebug!.splice(0, debugWindow.__whatfeesRuntimeDebug!.length - 40);
    }
  };

  const logEntry = (entry: RuntimeDebugEntry) => {
    pushEntry(entry);
    console.groupCollapsed(`[whatfees debug] ${entry.type}: ${entry.message}`);
    if (entry.details !== undefined) {
      console.log(entry.details);
    }
    console.groupEnd();
  };

  app.config.errorHandler = (error, instance, info) => {
    const normalized = error instanceof Error ? error : new Error(String(error));
    logEntry({
      time: new Date().toISOString(),
      type: "vue-error",
      message: normalized.message,
      details: {
        info,
        component: getComponentName(instance),
        stack: normalized.stack
      }
    });
  };

  app.config.warnHandler = (message, instance, trace) => {
    logEntry({
      time: new Date().toISOString(),
      type: "vue-warn",
      message,
      details: {
        component: getComponentName(instance),
        trace
      }
    });
  };

  window.addEventListener("error", (event) => {
    logEntry({
      time: new Date().toISOString(),
      type: "window-error",
      message: event.message || "Unhandled window error",
      details: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error instanceof Error ? {
          name: event.error.name,
          message: event.error.message,
          stack: event.error.stack
        } : event.error
      }
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason instanceof Error
      ? { name: event.reason.name, message: event.reason.message, stack: event.reason.stack }
      : event.reason;
    logEntry({
      time: new Date().toISOString(),
      type: "unhandled-rejection",
      message: event.reason instanceof Error ? event.reason.message : "Unhandled promise rejection",
      details: reason
    });
  });
}

const splashShownAt = performance.now();
const app = createApp(App);
installRuntimeDebugHooks(app);
try {
  app.use(vuetify).mount("#app");
} catch (error) {
  const normalized = error instanceof Error ? error : new Error(String(error));
  console.groupCollapsed(`[whatfees debug] mount-error: ${normalized.message}`);
  console.log({
    component: "root",
    stack: normalized.stack
  });
  console.groupEnd();
  throw error;
}

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
