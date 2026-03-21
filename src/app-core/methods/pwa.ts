import type { BeforeInstallPromptEvent } from "../../types/app.ts";
import type { AppContext, AppMethodState } from "../context.ts";

const DISMISSED_APP_UPDATE_SESSION_KEY = "whatfees_dismissed_app_update_worker";

function getSessionStorage(): Storage | null {
  try {
    return window.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function getWorkerScriptUrl(worker: ServiceWorker | null | undefined): string | null {
  const scriptUrl = typeof worker?.scriptURL === "string" ? worker.scriptURL.trim() : "";
  return scriptUrl || null;
}

function hasDismissedAppUpdate(): boolean {
  const storage = getSessionStorage();
  if (!storage) return false;

  try {
    return storage.getItem(DISMISSED_APP_UPDATE_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function clearDismissedAppUpdate(): void {
  const storage = getSessionStorage();
  if (!storage) return;

  try {
    storage.removeItem(DISMISSED_APP_UPDATE_SESSION_KEY);
  } catch {
    // Ignore storage failures.
  }
}

function dismissAppUpdateForWorker(worker: ServiceWorker | null | undefined): void {
  const storage = getSessionStorage();
  if (!storage || !worker) return;

  try {
    storage.setItem(DISMISSED_APP_UPDATE_SESSION_KEY, "1");
  } catch {
    // Ignore storage failures.
  }
}

export const pwaMethods: ThisType<AppContext> & Pick<
  AppMethodState,
  | "setupPwaUiHandlers"
  | "startOfflineReconnectScheduler"
  | "stopOfflineReconnectScheduler"
  | "promptInstall"
  | "applyAppUpdate"
  | "dismissAppUpdate"
  | "unregisterServiceWorkersForDev"
  | "registerServiceWorker"
> = {
  setupPwaUiHandlers(): void {
    if (this.hasPwaUiHandlersBound) return;

    this.onlineListener = () => {
      this.isOffline = false;
      this.notify("Back online", "success");
      this.stopOfflineReconnectScheduler();
      void this.debugLogEntitlement(true);
      if (this.isGoogleSignedIn) {
        void this.pushCloudSync();
      }
    };
    this.offlineListener = () => {
      this.isOffline = true;
      this.startOfflineReconnectScheduler();
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
    this.hasPwaUiHandlersBound = true;

    if (this.isOffline) {
      this.startOfflineReconnectScheduler();
    }
  },

  startOfflineReconnectScheduler(): void {
    if (this.offlineReconnectIntervalId != null) return;

    this.offlineReconnectIntervalId = window.setInterval(() => {
      if (!this.isOffline) {
        this.stopOfflineReconnectScheduler();
        return;
      }

      if (!navigator.onLine) return;

      this.isOffline = false;
      this.notify("Connection restored. Syncing…", "info");
      this.stopOfflineReconnectScheduler();
      void this.debugLogEntitlement(true);
      if (this.isGoogleSignedIn) {
        void this.pushCloudSync();
      }
    }, 60 * 1000);
  },

  stopOfflineReconnectScheduler(): void {
    if (this.offlineReconnectIntervalId == null) return;
    window.clearInterval(this.offlineReconnectIntervalId);
    this.offlineReconnectIntervalId = null;
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

  applyAppUpdate(): void {
    if (!this.appUpdateWorker) return;
    this.isApplyingAppUpdate = true;
    this.showAppUpdatePrompt = false;
    clearDismissedAppUpdate();
    this.notify("Refreshing to update WhatFees…", "info");
    this.appUpdateWorker.postMessage("SKIP_WAITING");
  },

  dismissAppUpdate(): void {
    this.showAppUpdatePrompt = false;
    dismissAppUpdateForWorker(this.appUpdateWorker);
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
    if (this.hasRegisteredServiceWorkerLifecycle) return;

    const runRegistration = async () => {
      let refreshing = false;

      try {
        const swUrl = "./sw.js";
        const registration = await navigator.serviceWorker.register(swUrl, {
          updateViaCache: "none"
        });

        const queueWaitingWorker = () => {
          const waitingWorker = registration.waiting;
          if (!waitingWorker || !navigator.serviceWorker.controller) return;

          this.appUpdateWorker = waitingWorker;
          this.isApplyingAppUpdate = false;

          if (hasDismissedAppUpdate()) {
            this.showAppUpdatePrompt = false;
            return;
          }

          clearDismissedAppUpdate();
          this.showAppUpdatePrompt = true;
        };

        if (registration.waiting && navigator.serviceWorker.controller) {
          queueWaitingWorker();
        }

        registration.addEventListener("updatefound", () => {
          clearDismissedAppUpdate();
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              queueWaitingWorker();
            }
          });
        });

        if (this.serviceWorkerControllerChangeListener) {
          navigator.serviceWorker.removeEventListener("controllerchange", this.serviceWorkerControllerChangeListener);
        }
        this.serviceWorkerControllerChangeListener = () => {
          if (refreshing || !this.isApplyingAppUpdate) return;
          refreshing = true;
          this.isApplyingAppUpdate = false;
          this.appUpdateWorker = null;
          clearDismissedAppUpdate();
          window.location.reload();
        };
        navigator.serviceWorker.addEventListener("controllerchange", this.serviceWorkerControllerChangeListener);

        await registration.update();
        if (this.serviceWorkerUpdateIntervalId != null) {
          window.clearInterval(this.serviceWorkerUpdateIntervalId);
        }
        this.serviceWorkerUpdateIntervalId = window.setInterval(() => {
          registration.update().catch(() => {});
        }, 60 * 1000);
      } catch (error) {
        console.warn("Service worker registration failed:", error);
      }
    };

    this.hasRegisteredServiceWorkerLifecycle = true;
    if (document.readyState === "complete") {
      void runRegistration();
      return;
    }

    this.serviceWorkerLoadListener = () => {
      this.serviceWorkerLoadListener = null;
      void runRegistration();
    };
    window.addEventListener("load", this.serviceWorkerLoadListener, { once: true });
  }
};
