/**
 * PRELAUNCH-HARDENING-1 Fase R7 — un trozo de la pantalla de Auditoría web.
 *
 * `page.tsx` tenía 1.933 líneas con catorce componentes de presentación
 * definidos dentro, así que para cambiar una fila había que navegar la página
 * entera. Son todos componentes de servidor y puros: reciben datos ya
 * calculados y devuelven marcado. Cero cambios de lógica y cero cambios de
 * marcado — el `ux-pilot` es quien lo verifica, porque esta fase SÍ toca UI
 * (log §83).
 */

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Madrid"
  });
}
