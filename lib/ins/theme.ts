// CONSOLE-INSTRUMENTO-1 · tema de la consola (log §349).
// Claro por defecto (decisión de Denis, 2026-10-27): el oscuro solo existe si
// la persona lo elige, nunca por `prefers-color-scheme`.
export const THEME_STORAGE_KEY = "gs-theme";
export type InsTheme = "light" | "dark";

export function parseTheme(raw: string | null | undefined): InsTheme {
  return raw === "dark" ? "dark" : "light";
}

/** Script inline para <head>: evita el parpadeo antes de hidratar. */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="dark")document.documentElement.setAttribute("data-theme","dark")}catch(e){}`;
