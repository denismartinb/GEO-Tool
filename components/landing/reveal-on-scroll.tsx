"use client";

import { useEffect, useRef } from "react";

/**
 * HOME-2026-08 Fase B1 — la revelación al entrar en pantalla de «Cómo
 * funciona», tal y como la define el artboard aprobado: cada paso recibe la
 * clase `is-in` al asomar y sus barras crecen de `scaleX(0)` a `scaleX(1)` en
 * 1,1 s con retardos escalonados (`.12/.26/.40/.54s`).
 *
 * **Por qué es una isla y por qué es TAN pequeña.** La landing se dejó
 * server-rendered a propósito (PRELAUNCH-HARDENING-1 Fase V): el campo del
 * hero era la única parte de cliente. Esto añade la segunda, así que se limita
 * a lo mínimo — un observador y una clase, sin estado de React, sin volver a
 * renderizar nada. El marcado y el contenido siguen viniendo del servidor: si
 * el JS no llega, los pasos se ven igual, sólo que ya revelados.
 *
 * **Se desconecta al terminar.** Cada paso se observa hasta que entra una vez;
 * después se deja de mirar y, cuando han entrado todos, el observador se
 * cierra. Una animación que ya ocurrió no necesita seguir vigilada
 * (`.claude/rules/onboarding.md`, «No hay reproducción perpetua»).
 *
 * **`prefers-reduced-motion` no degrada, revela y ya.** No hay fotograma
 * intermedio que contar aquí: la barra llena ES el dato. Con movimiento
 * reducido se marca todo como entrado en el primer efecto y no se observa
 * nada.
 */
export function RevealOnScroll({ selector }: { selector: string }) {
  const hecho = useRef(false);

  useEffect(() => {
    if (hecho.current) return;
    hecho.current = true;

    const pasos = Array.from(document.querySelectorAll<HTMLElement>(selector));
    if (pasos.length === 0) return;

    const quieto =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (quieto || typeof IntersectionObserver === "undefined") {
      pasos.forEach((p) => p.classList.add("is-in"));
      return;
    }

    let pendientes = pasos.length;
    const obs = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("is-in");
          obs.unobserve(e.target);
          pendientes -= 1;
        }
        if (pendientes <= 0) obs.disconnect();
      },
      // 0.28: el paso ya se lee cuando arranca, no cuando asoma un píxel.
      { threshold: 0.28 }
    );

    pasos.forEach((p) => obs.observe(p));
    return () => obs.disconnect();
  }, [selector]);

  return null;
}
