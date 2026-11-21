"use client";

import { useEffect } from "react";

/**
 * ANDROID-TWA-1 + APP-LAUNCH-1 (log §381, §389): registra el service worker
 * (pantalla «sin conexión» y caché de lo estático). No pinta nada. Solo en
 * producción: en desarrollo los ficheros de `/_next/static/` no llevan hash y
 * la caché serviría código viejo.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
