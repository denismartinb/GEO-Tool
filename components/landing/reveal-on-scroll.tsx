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
 * reducido no se arma nada y los pasos se quedan como los pintó el servidor.
 *
 * **El estado oculto lo enciende esta isla, no la hoja de estilos.** Es lo que
 * hace cierta la frase de arriba. Escrito al revés —`opacity: 0` y
 * `scaleX(0)` en el CSS a secas, revelados sólo al llegar `is-in`— la sección
 * ENTERA desaparecía sin JS: cuatro pasos invisibles y tres barras a cero, en
 * la única superficie oscura del sitio. El CSS sólo esconde bajo `.is-armed`,
 * que se pone aquí; sin JS esa clase no llega nunca y no hay nada que
 * revelar. Lo que ya está en pantalla al armar se marca `is-in` en el mismo
 * fotograma, para que no dé un salto de visible a oculto y vuelta.
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

    if (quieto || typeof IntersectionObserver === "undefined") return;

    // Armar y, en el mismo fotograma, dar por entrado lo que ya se ve.
    for (const p of pasos) {
      p.classList.add("is-armed");
      const r = p.getBoundingClientRect();
      const visible = r.top < window.innerHeight && r.bottom > 0;
      if (visible) p.classList.add("is-in");
    }

    let pendientes = pasos.filter((p) => !p.classList.contains("is-in")).length;
    if (pendientes === 0) return;
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

    pasos.filter((p) => !p.classList.contains("is-in")).forEach((p) => obs.observe(p));
    return () => obs.disconnect();
  }, [selector]);

  return null;
}
