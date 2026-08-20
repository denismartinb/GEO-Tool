/**
 * DEBUG-ACTIVE-PROJECT-1 — tracks which project the console is currently
 * pointed at, so the `/debug` shortcut can resolve "the domain currently
 * selected" instead of "the most recently created project".
 *
 * The console has no other notion of "selected project" — the sidebar itself
 * derives it from the URL (`components/sidebar.tsx`, `getProjectId`). Being
 * on a project's route IS the definition of "selected", so `middleware.ts`
 * mirrors that same regex into a cookie on every request, and `/debug` reads
 * it back. Middleware, not `requireActiveProject`, because Next.js only
 * allows writing cookies from Route Handlers / Server Actions / middleware —
 * not from a Server Component's render.
 *
 * DOMAINS-LIVE-SELECT-1 extended that same cookie to a second source:
 * selecting a domain card on `/dashboard/domains?active=<id>` doesn't
 * navigate anywhere (founder decision, 2026-08-05 — see that page's header
 * comment), so it never crosses `getProjectIdFromPathname`. Without also
 * writing the cookie there, the sidebar kept pointing at whatever project the
 * URL last carried, so picking a card changed the hero but nothing else in
 * the console — the founder had to open the project for real (click "Ver
 * visión general") before the rest of the console caught up.
 */
export const ACTIVE_PROJECT_COOKIE = "geo_active_project";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Extracts a project id from a `/dashboard/projects/[projectId]/...` pathname, excluding the `new` route. */
export function getProjectIdFromPathname(pathname: string): string | null {
  const match = pathname.match(/^\/dashboard\/projects\/([^/]+)/)?.[1] ?? null;
  if (!match || !UUID_RE.test(match)) return null;
  return match;
}

/** Extracts and validates the `?active=<id>` query param on `/dashboard/domains`, the other place selection can change without a pathname change. */
export function getProjectIdFromDomainsQuery(pathname: string, searchParams: URLSearchParams): string | null {
  if (pathname !== "/dashboard/domains") return null;
  const value = searchParams.get("active");
  return value && UUID_RE.test(value) ? value : null;
}

/**
 * Picks which project a screen without its own explicit selection should
 * show, in the same priority order `/debug` already applies: an explicit
 * request (e.g. `?active=<id>`) wins, then the cookie above (the project the
 * console was last actually pointed at), then the first project of the list
 * (the account's most recently created one, the historical fallback).
 *
 * `projects` is expected already account-scoped (RLS) and archived-filtered
 * by the caller, so a stale or foreign id in `requestedId`/`rememberedId`
 * simply fails to match and falls through — same safety property `/debug`
 * relies on for its own cookie read.
 */
export function resolveSelectedProject<T extends { id: string }>(
  projects: T[],
  requestedId: string | null | undefined,
  rememberedId: string | null | undefined
): T | undefined {
  const requested = requestedId ? projects.find((p) => p.id === requestedId) : undefined;
  if (requested) return requested;
  const remembered = rememberedId ? projects.find((p) => p.id === rememberedId) : undefined;
  if (remembered) return remembered;
  return projects[0];
}
