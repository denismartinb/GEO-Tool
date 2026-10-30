// CONSOLE-INSTRUMENTO-1 F1 · menú de la consola «Instrumento» (log §349).
// Cuatro grupos como en el prototipo v51: sin título (Visión general y
// Recomendaciones), «En la IA», «En Google» y «Comercio agéntico» (Nuevo).
// Las rutas son las de siempre: renombrarlas rompería enlaces ya enviados.

export type InsCountKey = "prompts" | "competitors" | "recs";

export type InsNavItem = {
  /** Segmento tras `/dashboard/projects/<id>`. Vacío = Visión general. */
  segment: string;
  label: string;
  icon: string;
  countKey?: InsCountKey;
};

export type InsNavGroup = { label: string | null; isNew?: boolean; items: InsNavItem[] };

export const INS_NAV: InsNavGroup[] = [
  {
    label: null,
    items: [
      { segment: "", label: "Visión general", icon: "overview" },
      { segment: "/recommendations", label: "Recomendaciones", icon: "recs", countKey: "recs" }
    ]
  },
  {
    label: "En la IA",
    items: [
      { segment: "/prompts", label: "Prompts", icon: "prompts", countKey: "prompts" },
      { segment: "/competitors", label: "Competidores", icon: "users", countKey: "competitors" },
      { segment: "/citations", label: "Páginas citadas", icon: "link" }
    ]
  },
  {
    label: "En Google",
    items: [
      { segment: "/search-console", label: "Posición en Google", icon: "trend" },
      { segment: "/web-audit", label: "Auditoría técnica", icon: "audit" }
    ]
  },
  {
    label: "Comercio agéntico",
    isNew: true,
    items: [
      { segment: "/agentic-visibility", label: "Visibilidad en agentes", icon: "agent" },
      { segment: "/agentic-audit", label: "Auditoría agéntica", icon: "cart" }
    ]
  }
];

export const INS_NAV_FLAT: InsNavItem[] = INS_NAV.flatMap((g) => g.items);

export function projectIdFromPath(pathname: string): string | null {
  return pathname.match(/^\/dashboard\/projects\/([^/]+)/)?.[1] ?? null;
}

/** ¿Está activa esta entrada para esta ruta? Visión general solo en la raíz del proyecto. */
export function isNavActive(pathname: string, projectId: string, item: InsNavItem): boolean {
  const href = `/dashboard/projects/${projectId}${item.segment}`;
  return item.segment ? pathname === href || pathname.startsWith(`${href}/`) : pathname === href;
}

const FIXED_CRUMBS: Array<[RegExp, string]> = [
  [/^\/dashboard\/settings/, "Tu perfil"],
  [/^\/dashboard\/notifications/, "Notificaciones"],
  [/^\/dashboard\/domains/, "Dominios"],
  [/^\/dashboard\/projects\/new/, "Nuevo dominio"]
];

/** Título de la miga de pan para la ruta actual. */
export function crumbForPath(pathname: string): string {
  const fixed = FIXED_CRUMBS.find(([re]) => re.test(pathname));
  if (fixed) return fixed[1];
  const id = projectIdFromPath(pathname);
  if (id) {
    const item = INS_NAV_FLAT.find((n) => isNavActive(pathname, id, n));
    if (item) return item.label;
  }
  return "Visión general";
}

// MOBILE-TABBAR-1 · barra inferior flotante de la consola en móvil (log §380).
// Cinco pestañas que agrupan las pantallas del menú lateral; las familias con
// varias pantallas enseñan unas pastillas al inicio de la página. Las rutas
// son las mismas: solo cambia cómo se llega a ellas.

export type InsTabKey = "home" | "recs" | "ia" | "google" | "agents";

export type InsTab = {
  key: InsTabKey;
  /** Nombre completo (accesibilidad y pastillas). */
  label: string;
  /** Rótulo de la barra, corto para que quepan las cinco. */
  short: string;
  icon: string;
  isNew?: boolean;
  /** Segmentos de las pantallas de la pestaña, en el orden de las pastillas. */
  segments: string[];
};

export const INS_TABS: InsTab[] = [
  { key: "home", label: "Visión general", short: "Inicio", icon: "overview", segments: [""] },
  { key: "recs", label: "Recomendaciones", short: "Plan", icon: "recs", segments: ["/recommendations"] },
  { key: "ia", label: "En la IA", short: "En la IA", icon: "prompts", segments: ["/prompts", "/competitors", "/citations"] },
  { key: "google", label: "En Google", short: "Google", icon: "trend", segments: ["/search-console", "/web-audit"] },
  { key: "agents", label: "Comercio agéntico", short: "Agentes", icon: "agent", isNew: true, segments: ["/agentic-visibility", "/agentic-audit"] }
];

/** La pestaña a la que pertenece esta ruta, o null (ajustes, avisos, dominios…). */
export function tabForPath(pathname: string, projectId: string): InsTab | null {
  return (
    INS_TABS.find((t) =>
      t.segments.some((s) => {
        const item = INS_NAV_FLAT.find((n) => n.segment === s);
        return item ? isNavActive(pathname, projectId, item) : false;
      })
    ) ?? null
  );
}

/** Pantalla a la que lleva una pestaña: la última que se vio en ella, o su primera. */
export function tabTarget(tab: InsTab, last: Partial<Record<InsTabKey, string>>): string {
  const seg = last[tab.key];
  return seg !== undefined && tab.segments.includes(seg) ? seg : tab.segments[0];
}

/** Las pastillas de subpantallas solo existen en las pestañas con varias. */
export function tabSubItems(tab: InsTab): InsNavItem[] {
  if (tab.segments.length < 2) return [];
  return tab.segments.map((s) => INS_NAV_FLAT.find((n) => n.segment === s)!);
}
