"use client";

import { useEffect } from "react";

/** ANDROID-TWA-1: registra el service worker de la pantalla «sin conexión». No pinta nada. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
