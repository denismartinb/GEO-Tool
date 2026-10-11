/**
 * ADMIN-PANEL-1 (Denis, 2026-10-11) — a browser used by the team sends no web
 * analytics, so /admin/panel counts only real visitors.
 *
 * PostHog runs cookieless (`components/posthog-provider.tsx`), so a visit
 * carries no account and cannot be filtered out after the fact. The only
 * place to leave our own visits out is the browser that makes them: a single
 * `localStorage` flag, written on team devices only, that stops PostHog from
 * loading at all. It is an opt-out, not an identifier: it says nothing about
 * who the visitor is and is never sent anywhere.
 *
 * Two ways to set it: automatically when a team account opens the console or
 * /admin (`InternalVisitorMark`), or by hand by opening any page with
 * `?interno=1` (and `?interno=0` to undo it), for a device nobody logs in
 * from.
 */
export const INTERNAL_VISITOR_KEY = "gs_internal_visitor";
export const INTERNAL_VISITOR_PARAM = "interno";

export function isInternalVisitor(): boolean {
  try {
    return window.localStorage.getItem(INTERNAL_VISITOR_KEY) === "1";
  } catch {
    return false;
  }
}

export function setInternalVisitor(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(INTERNAL_VISITOR_KEY, "1");
    else window.localStorage.removeItem(INTERNAL_VISITOR_KEY);
  } catch {
    // Storage blocked (private mode, site data cleared): nothing to remember.
  }
}

/** Applies `?interno=1` / `?interno=0` from the current URL, if present. */
export function applyInternalVisitorParam(search: string): void {
  const value = new URLSearchParams(search).get(INTERNAL_VISITOR_PARAM);
  if (value === "1") setInternalVisitor(true);
  else if (value === "0") setInternalVisitor(false);
}
