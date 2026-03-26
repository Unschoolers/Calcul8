const swVersion = new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE_NAME = `whatfees-${swVersion}`;

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE_ASSETS);
  })());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    );
    await self.clients.claim();
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
    return new Request(request, { cache: "reload" });
  } catch {
    return request;
  }
}

async function networkFirst(request, { fallbackResponse = null, forceFresh = false } = {}) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(forceFresh ? cloneRequestForReload(request) : request);
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
