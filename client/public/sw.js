const CACHE_PREFIX = "nexora-shell-";
const CACHE = "nexora-shell-v3.5.0";
const SHELL = ["/", "/manifest.webmanifest", "/nexora-icon.png"];

function cacheable(request, response) {
  if (!response?.ok || response.type === "opaque") return false;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return false;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/socket.io/")) return false;
  const control = String(response.headers.get("Cache-Control") || "").toLowerCase();
  return !control.includes("no-store") && !response.headers.has("Set-Cookie");
}

async function notifyClients(state, details = {}) {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of clients) client.postMessage({ type: "NEXORA_PWA_UPDATE", state, ...details });
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    await notifyClients("downloading");
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL.map((url) => new Request(url, { cache: "reload", credentials: "same-origin" })));
    await notifyClients("ready");
  })().catch(async (error) => {
    await notifyClients("error", { message: String(error?.message || "install_failed") });
    throw error;
  }));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
    await notifyClients("active");
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "NEXORA_SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/socket.io/")) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (cacheable(request, response)) {
          const cache = await caches.open(CACHE);
          await cache.put("/", response.clone());
        }
        return response;
      } catch {
        return (await caches.match("/")) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    const network = fetch(request).then(async (response) => {
      if (cacheable(request, response)) {
        const cache = await caches.open(CACHE);
        await cache.put(request, response.clone());
      }
      return response;
    }).catch(() => null);
    if (cached) {
      event.waitUntil(network);
      return cached;
    }
    return (await network) || Response.error();
  })());
});

self.addEventListener("sync", (event) => {
  if (event.tag !== "nexora-outbox") return;
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clients) client.postMessage({ type: "NEXORA_OUTBOX_RETRY" });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const target = new URL("/", self.location.origin);
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const visible = clients.find((client) => "focus" in client);
    if (visible) {
      await visible.focus();
      visible.postMessage({ type: "NEXORA_NOTIFICATION_OPEN", data: event.notification.data || {} });
      return;
    }
    if (self.clients.openWindow) await self.clients.openWindow(target.toString());
  })());
});
