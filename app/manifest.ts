import type { MetadataRoute } from "next";

/**
 * ANDROID-TWA-1 · manifiesto de la app web. `start_url` lleva `?source=twa`: es
 * la señal con la que el middleware activa el modo app (sin precios ni compra,
 * log §364). `scope` es todo el sitio porque la TWA no puede salir de él.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GenScore",
    short_name: "GenScore",
    description: "Mide y mejora cómo te nombra la IA.",
    lang: "es-ES",
    id: "/dashboard",
    start_url: "/dashboard?source=twa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#0b1426",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
    ]
  };
}
