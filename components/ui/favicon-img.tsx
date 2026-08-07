"use client";

import { useState } from "react";
import { faviconImgProps } from "@/lib/domains/favicon";
import type { ReactNode } from "react";

/**
 * Icono real de una marca, con caída a lo que le pases cuando no hay ninguno.
 *
 * Existe por una razón concreta (FAVICON-QUALITY-3a): hasta ahora la caída sólo
 * ocurría cuando **faltaba el dominio**, así que un dominio cuyo icono Google
 * desconoce enseñaba el globo genérico para siempre. Ahora `/api/favicon`
 * devuelve **204 sin cuerpo** en ese caso; un `<img>` sin nada que decodificar
 * dispara `onError`, y aquí se pinta el `fallback`.
 *
 * El `fallback` es un ReactNode y no props de estilo a propósito: cada pantalla
 * ya tenía su propio avatar de iniciales, con su clase y su color determinista,
 * y unificarlos habría sido un rediseño encubierto. Este componente aporta el
 * comportamiento, no la apariencia.
 *
 * Es cliente porque `onError` lo exige. Las pantallas que lo usan siguen siendo
 * servidor: le pasan el `fallback` ya renderizado.
 */
export function FaviconImg({
  domain,
  cssSize,
  className,
  fallback,
  style
}: {
  domain: string | null | undefined;
  /** Tamaño al que se pinta, en px CSS. Determina la resolución que se pide. */
  cssSize: number;
  className?: string;
  fallback: ReactNode;
  style?: React.CSSProperties;
}) {
  const [failed, setFailed] = useState(false);
  const img = faviconImgProps(domain, cssSize);

  if (!img || failed) return <>{fallback}</>;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- servicio de favicons vía nuestra propia ruta, no un asset estático
    <img
      {...img}
      alt=""
      className={className}
      style={style}
      width={cssSize}
      height={cssSize}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
