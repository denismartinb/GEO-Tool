// CONSOLE-INSTRUMENTO-1 · tema de la consola (log §349).
// Claro por defecto (decisión de Denis, 2026-10-27): el oscuro solo existe si
// la persona lo elige, nunca por `prefers-color-scheme`.
// DARK-MODE-MENU-1 (log §397): el único sitio donde se elige es la fila
// «Modo oscuro» del menú de cuenta. Nunca en la cabecera (Denis, 2026-10-31).
export const THEME_STORAGE_KEY = "gs-theme";
export type InsTheme = "light" | "dark";

export function parseTheme(raw: string | null | undefined): InsTheme {
  return raw === "dark" ? "dark" : "light";
}

/** Script inline para <body>: evita el parpadeo antes de hidratar. */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="dark")document.documentElement.setAttribute("data-theme","dark")}catch(e){}`;

/** Tema que hay ahora mismo en `<html>` (lo puso el script inicial o el interruptor). */
export function currentTheme(): InsTheme {
  if (typeof document === "undefined") return "light";
  return parseTheme(document.documentElement.getAttribute("data-theme"));
}

/** Aplica el tema a `<html>` y lo recuerda en este dispositivo. */
export function applyTheme(theme: InsTheme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (theme === "dark") root.setAttribute("data-theme", "dark");
  else root.removeAttribute("data-theme");
  try {
    if (theme === "dark") window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    else window.localStorage.removeItem(THEME_STORAGE_KEY);
  } catch {
    // Sin almacenamiento (modo privado): el tema dura lo que la pestaña.
  }
}
