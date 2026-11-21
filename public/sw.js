// ANDROID-TWA-1 + APP-LAUNCH-1 · service worker de la app (log §381, §389).
//
// Guarda SOLO lo estático que no cambia entre clientes: el JS y el CSS con hash
// de `/_next/static/` (incluidas las fuentes de next/font), los iconos y la
// marca, y la pantalla «sin conexión». Nunca guarda una navegación, una
// respuesta de la API ni una carga de datos de la consola (RSC): los datos de
// un cliente siempre son los de ahora y nunca pueden quedarse en este
// dispositivo para otra cuenta. Una navegación sin red enseña la pantalla
// «sin conexión».
const VERSION = "v2";
const STATIC = `gs-static-${VERSION}`;
const OFFLINE_CACHE = `gs-offline-${VERSION}`;
const OFFLINE = "/offline.html";
const PRECACHE = [OFFLINE, "/icons/icon-192.png"];
// Los ficheros con hash se acumulan de despliegue en despliegue: se recorta.
const MAX_STATIC_ENTRIES = 300;

const STATIC_PREFIXES = ["/_next/static/", "/icons/", "/brand/"];
const STATIC_FILES = ["/favicon.ico", "/apple-touch-icon.png"];

function isCacheableStatic(url) {
  if (url.origin !== self.location.origin) return false;
  if (url.search) return false;
  return STATIC_PREFIXES.some((p) => url.pathname.startsWith(p)) || STATIC_FILES.includes(url.pathname);
}

async function trim(cache) {
  const keys = await cache.keys();
  const extra = keys.length - MAX_STATIC_ENTRIES;
  for (let i = 0; i < extra; i++) await cache.delete(keys[i]);
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
    await cache.put(request, response.clone());
    trim(cache).catch(() => {});
  }
  return response;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  const keep = [STATIC, OFFLINE_CACHE];
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !keep.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE)));
    return;
  }
  const url = new URL(request.url);
  if (!isCacheableStatic(url)) return;
  event.respondWith(cacheFirst(request));
});
