const swVersion = new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE_NAME = `whatfees-${swVersion}`;

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled(
      CORE_ASSETS.map(async (asset) => {
        try {
          const request = cloneRequestForReload(new Request(asset));
          const response = await fetch(request);
          if (response && response.ok) {
            await cache.put(asset, response.clone());
          }
        } catch (error) {
          console.warn("[sw] Failed to precache asset:", asset, error);
        }
      })
    );
  })());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const staleKeys = keys.filter((key) => key !== CACHE_NAME);
    await Promise.all(
      staleKeys
        .map((key) => caches.delete(key))
    );
    await self.clients.claim();
    if (staleKeys.length > 0) {
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      await Promise.allSettled(
        clients.map(async (client) => {
          if (!("navigate" in client) || typeof client.navigate !== "function") return;
          const refreshUrl = buildClientRefreshUrl(client.url);
          await client.navigate(refreshUrl);
        })
      );
    }
  })());
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function createOfflineResponse() {
  return new Response("Offline", { status: 503, statusText: "Offline" });
}

function cloneRequestForReload(request) {
  try {
    return new Request(request, { cache: "no-store" });
  } catch {
    return request;
  }
}

function isUpdateRefreshRequest(url) {
  return url.searchParams.has("app-updated");
}

function buildClientRefreshUrl(urlString) {
  try {
    const url = new URL(urlString);
    url.searchParams.set("app-updated", String(Date.now()));
    url.searchParams.set("app-update-source", "sw");
    return url.toString();
  } catch {
    return urlString;
  }
}

async function fetchFresh(request) {
  return fetch(cloneRequestForReload(request));
}

async function networkFirst(request, { fallbackResponse = null, forceFresh = false } = {}) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await (forceFresh ? fetchFresh(request) : fetch(request));
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cachedResponse = await cache.match(request);
    if (cachedResponse) return cachedResponse;
    if (fallbackResponse) return fallbackResponse;
    return createOfflineResponse();
  }
}

async function networkFirstNavigation(request) {
  const url = new URL(request.url);
  if (isUpdateRefreshRequest(url)) {
    try {
      const response = await fetchFresh(request);
      if (response && response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put("./index.html", response.clone());
      }
      return response;
    } catch {
      return createOfflineResponse();
    }
  }

  const cache = await caches.open(CACHE_NAME);
  const cachedPage = await cache.match("./index.html");
  return networkFirst(request, {
    fallbackResponse: cachedPage ?? createOfflineResponse(),
    forceFresh: true
  });
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const networkFetch = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    return cached;
  }

  const networkResponse = await networkFetch;
  if (networkResponse) {
    return networkResponse;
  }

  return createOfflineResponse();
}

function shouldUseNetworkFirst(request, url) {
  if (url.origin !== self.location.origin) {
    return false;
  }

  if (["script", "style", "worker", "manifest"].includes(request.destination)) {
    return true;
  }

  const pathname = url.pathname.toLowerCase();
  return pathname.includes("/assets/")
    && (pathname.endsWith(".js") || pathname.endsWith(".css") || pathname.endsWith(".webmanifest"));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  // Do not cache cross-origin responses in this SW.
  if (url.origin !== self.location.origin) {
    event.respondWith(fetch(request));
    return;
  }

  if (shouldUseNetworkFirst(request, url)) {
    event.respondWith(networkFirst(request, { forceFresh: true }));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});
