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
 */
export const ACTIVE_PROJECT_COOKIE = "geo_active_project";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Extracts a project id from a `/dashboard/projects/[projectId]/...` pathname, excluding the `new` route. */
export function getProjectIdFromPathname(pathname: string): string | null {
  const match = pathname.match(/^\/dashboard\/projects\/([^/]+)/)?.[1] ?? null;
  if (!match || !UUID_RE.test(match)) return null;
  return match;
}
