"use client";

import { useEffect, useRef, type TextareaHTMLAttributes } from "react";
import { Textarea } from "@/components/ui/textarea";

/**
 * Editor de un prompt: crece hasta enseñar el texto ENTERO (con un techo, a
 * partir del cual se desplaza). Antes medía 76px fijos y un prompt de 218
 * caracteres quedaba cortado dentro del propio editor, que es justo donde se
 * manda a la persona a leerlo completo (corrección tras la prueba real).
 */
const MAX_HEIGHT_PX = 320;

export function AutoGrowTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = wrapperRef.current?.querySelector("textarea");
    if (!el) return;
    const fit = () => {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight + 2, MAX_HEIGHT_PX)}px`;
    };
    fit();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [props.value]);
  return (
    <div ref={wrapperRef}>
      <Textarea {...props} />
    </div>
  );
}
