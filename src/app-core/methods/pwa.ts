import type { BeforeInstallPromptEvent } from "../../types/app.ts";
import type { PwaMethodImplementation } from "../context/shell.ts";
import { getAppRuntime } from "../platform/runtime.ts";

const DISMISSED_APP_UPDATE_SESSION_KEY = "whatfees_dismissed_app_update_worker";
const APP_UPDATE_NAVIGATION_FALLBACK_MS = 4000;

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

function hasDismissedAppUpdate(worker: ServiceWorker | null | undefined): boolean {
  const storage = getSessionStorage();
  if (!storage) return false;

  try {
    const dismissedScriptUrl = String(storage.getItem(DISMISSED_APP_UPDATE_SESSION_KEY) || "").trim();
    const workerScriptUrl = getWorkerScriptUrl(worker);
    return !!dismissedScriptUrl && !!workerScriptUrl && dismissedScriptUrl === workerScriptUrl;
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
  const workerScriptUrl = getWorkerScriptUrl(worker);
  if (!storage || !workerScriptUrl) return;

  try {
    storage.setItem(DISMISSED_APP_UPDATE_SESSION_KEY, workerScriptUrl);
  } catch {
    // Ignore storage failures.
  }
}

function buildUpdateRefreshUrl(): string {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("app-updated", String(Date.now()));
    url.searchParams.set("app-update-source", "sw");
    return url.toString();
  } catch {
    return window.location.href;
  }
}

export const pwaMethods = {
  setupPwaUiHandlers(): void {
    if (this.hasPwaUiHandlersBound) return;

    this.onlineListener = () => {
      this.isOffline = false;
      this.notify("Back online", "success");
      this.stopOfflineReconnectScheduler();
      void this.debugLogEntitlement(true);
      if (this.isGoogleSignedIn) {
        void this.pushCloudSync();
        void this.retryPendingBuyerProfiles();
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
    if (getAppRuntime() === "web") {
      window.addEventListener("beforeinstallprompt", this.beforeInstallPromptListener);
      window.addEventListener("appinstalled", this.appInstalledListener);
    }
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
        void this.retryPendingBuyerProfiles();
      }
    }, 60 * 1000);
  },

  stopOfflineReconnectScheduler(): void {
    if (this.offlineReconnectIntervalId == null) return;
    window.clearInterval(this.offlineReconnectIntervalId);
    this.offlineReconnectIntervalId = null;
  },

  async promptInstall(): Promise<void> {
    if (getAppRuntime() === "android") return;
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
    if (getAppRuntime() === "android") return;
    if (!this.appUpdateWorker) return;
    this.isApplyingAppUpdate = true;
    this.showAppUpdatePrompt = false;
    clearDismissedAppUpdate();
    this.notify("Refreshing to update WhatFees…", "info");
    this.appUpdateWorker.postMessage("SKIP_WAITING");
    window.setTimeout(() => {
      if (!this.isApplyingAppUpdate) return;
      window.location.replace(buildUpdateRefreshUrl());
    }, APP_UPDATE_NAVIGATION_FALLBACK_MS);
  },

  dismissAppUpdate(): void {
    if (getAppRuntime() === "android") return;
    this.showAppUpdatePrompt = false;
    dismissAppUpdateForWorker(this.appUpdateWorker);
  },

  async unregisterServiceWorkersForDev(): Promise<void> {
    if (getAppRuntime() === "android") return;
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
    if (getAppRuntime() === "android") return;
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

          if (hasDismissedAppUpdate(waitingWorker)) {
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
          window.location.replace(buildUpdateRefreshUrl());
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
} satisfies PwaMethodImplementation;

