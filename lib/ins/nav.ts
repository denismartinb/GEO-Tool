// CONSOLE-INSTRUMENTO-1 F1 · menú de la consola «Instrumento» (log §349).
// Cuatro grupos como en el prototipo v51 (con la auditoría técnica desdoblada, log §368): sin título (Visión general y
// Recomendaciones), «En la IA», «En Google» y «Comercio agéntico» (Nuevo).
// Las rutas son las de siempre: renombrarlas rompería enlaces ya enviados.

export type InsCountKey = "prompts" | "competitors" | "recs";

export type InsNavItem = {
  /** Segmento tras `/dashboard/projects/<id>`. Vacío = Visión general. */
  segment: string;
  label: string;
  icon: string;
  countKey?: InsCountKey;
  /** Entradas que comparten ruta y se distinguen por `?bloque=` (Auditoría técnica). */
  block?: "geo" | "seo";
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
      { segment: "/citations", label: "Páginas citadas", icon: "link" },
      { segment: "/web-audit", label: "Tu web para la IA", icon: "audit", block: "geo" }
    ]
  },
  {
    label: "En Google",
    items: [
      { segment: "/search-console", label: "Posición en Google", icon: "trend" },
      { segment: "/web-audit", label: "Tu web para Google", icon: "audit", block: "seo" }
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

/**
 * Destino al cambiar de dominio: la misma sección de primer nivel (`/competitors`,
 * `/web-audit`...) del dominio elegido. Fuera de un proyecto, o en la visión
 * general, cae en la portada del proyecto.
 */
export function switchProjectHref(pathname: string, projectId: string): string {
  const section = pathname.match(/^\/dashboard\/projects\/[^/]+\/([^/]+)/)?.[1];
  return `/dashboard/projects/${projectId}${section ? `/${section}` : ""}`;
}

/** Destino de una entrada: las de Auditoría técnica llevan su bloque en la URL. */
export function navHref(projectId: string, item: InsNavItem): string {
  const base = `/dashboard/projects/${projectId}${item.segment}`;
  return item.block ? `${base}?bloque=${item.block}` : base;
}

/**
 * ¿Está activa esta entrada para esta ruta? Visión general solo en la raíz del
 * proyecto. `block` es el `?bloque=` de la URL (geo si falta): solo cuenta para
 * las entradas que comparten ruta.
 */
export function isNavActive(pathname: string, projectId: string, item: InsNavItem, block: "geo" | "seo" = "geo"): boolean {
  const href = `/dashboard/projects/${projectId}${item.segment}`;
  const onRoute = item.segment ? pathname === href || pathname.startsWith(`${href}/`) : pathname === href;
  return onRoute && (!item.block || item.block === block);
}

const FIXED_CRUMBS: Array<[RegExp, string]> = [
  [/^\/dashboard\/settings/, "Tu perfil"],
  [/^\/dashboard\/notifications/, "Notificaciones"],
  [/^\/dashboard\/domains/, "Dominios"],
  [/^\/dashboard\/projects\/new/, "Nuevo dominio"]
];

/** Título de la miga de pan para la ruta actual. */
export function crumbForPath(pathname: string, block: "geo" | "seo" = "geo"): string {
  const fixed = FIXED_CRUMBS.find(([re]) => re.test(pathname));
  if (fixed) return fixed[1];
  const id = projectIdFromPath(pathname);
  if (id) {
    const item = INS_NAV_FLAT.find((n) => isNavActive(pathname, id, n, block));
    if (item) return item.label;
  }
  return "Visión general";
}
