import { APP_VERSION } from "../../constants.ts";
import type { BeforeInstallPromptEvent } from "../../types/app.ts";
import type { AppContext, AppMethodState } from "../context.ts";

export const pwaMethods: ThisType<AppContext> & Pick<
  AppMethodState,
  "setupPwaUiHandlers" | "promptInstall" | "unregisterServiceWorkersForDev" | "registerServiceWorker"
> = {
  setupPwaUiHandlers(): void {
    this.onlineListener = () => {
      this.isOffline = false;
      this.notify("Back online", "success");
    };
    this.offlineListener = () => {
      this.isOffline = true;
    };
    this.beforeInstallPromptListener = (event: Event) => {
      const promptEvent = event as BeforeInstallPromptEvent;
      promptEvent.preventDefault();
      this.deferredInstallPrompt = promptEvent;
      this.showInstallPrompt = true;
    };
    this.appInstalledListener = () => {
      this.showInstallPrompt = false;
      this.deferredInstallPrompt = null;
    };

    window.addEventListener("online", this.onlineListener);
    window.addEventListener("offline", this.offlineListener);
    window.addEventListener("beforeinstallprompt", this.beforeInstallPromptListener);
    window.addEventListener("appinstalled", this.appInstalledListener);
  },

  async promptInstall(): Promise<void> {
    if (!this.deferredInstallPrompt) return;

    this.deferredInstallPrompt.prompt();
    const result = await this.deferredInstallPrompt.userChoice;
    this.showInstallPrompt = false;
    this.deferredInstallPrompt = null;

    if (result?.outcome === "accepted") {
      this.notify("Install started", "success");
    }
  },

  async unregisterServiceWorkersForDev(): Promise<void> {
    if (!("serviceWorker" in navigator)) return;
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
    } catch (error) {
      console.warn("Failed to clean service workers in dev:", error);
    }
  },

  registerServiceWorker(): void {
    if (!("serviceWorker" in navigator)) return;
    window.addEventListener("load", async () => {
      let refreshing = false;

      try {
        const swUrl = `./sw.js?v=${encodeURIComponent(APP_VERSION)}`;
        const registration = await navigator.serviceWorker.register(swUrl, {
          updateViaCache: "none"
        });

        const activateWaitingWorker = () => {
          if (registration.waiting) {
            registration.waiting.postMessage("SKIP_WAITING");
          }
        };

        if (registration.waiting && navigator.serviceWorker.controller) {
          activateWaitingWorker();
        }

        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              activateWaitingWorker();
            }
          });
        });

        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (refreshing) return;
          refreshing = true;
          window.location.reload();
        });

        await registration.update();
        window.setInterval(() => {
          registration.update().catch(() => {});
        }, 60 * 1000);
      } catch (error) {
        console.warn("Service worker registration failed:", error);
      }
    });
  }
};
