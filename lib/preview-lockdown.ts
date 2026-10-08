/**
 * PREVIEW-LOCKDOWN-1 (Director, #549, 2026-10-08). This module exists ONLY on the branch
 * `preview/contract-99-ui`, which is a review aid for the 99 € surfaces and the corrected e-mails. It is NOT meant
 * to be merged.
 *
 * Why it exists: a Vercel preview deployment inherits whatever environment variables the owner scoped to the
 * Preview environment, and from this session they cannot be inspected (the Vercel API answered 403). A preview that
 * silently carried the LIVE Supabase and Stripe keys could write to production the moment someone pressed a button.
 * Promising "don't press anything" is not a barrier, so the barrier is in the request path, before any application code:
 *
 *   1. DENY BY DEFAULT. Only GET/HEAD on an allow-list of public, read-only pages and static assets are served.
 *      Everything else — every API route, server action (always a POST), the console, the admin, sign-up/log-in,
 *      the auth callback, the e-mail unsubscribe, the crons — answers 403 without running a single line of handler.
 *   2. The decision is taken at the very top of `middleware.ts`, before the Supabase client is even created, so a
 *      locked request makes NO call to Supabase (not even the session refresh the normal middleware does).
 *   3. A Content-Security-Policy with `connect-src 'self'` and `form-action 'self'` stops the BROWSER from talking to
 *      Supabase, Stripe, PostHog or Sentry from any page that is served.
 *
 * The lock is active everywhere EXCEPT a production deployment (`VERCEL_ENV === "production"`): local runs and tests
 * are locked too, so what is tested is what ships. It is a tripwire for review, not a security product: it does not
 * make the preview safe against a deployment that is promoted to production, and it cannot see environment variables.
 */

export type LockdownDecision = { allow: true } | { allow: false; reason: string };

/** Read-only public surfaces. Exact paths, or a prefix followed by `/`. Nothing else is ever served. */
const ALLOWED_EXACT = new Set([
  "/",
  "/pricing",
  "/robots.txt",
  "/sitemap.xml",
  "/llms.txt",
  "/feed.xml",
  "/favicon.ico",
  "/apple-touch-icon.png",
  "/icon.svg",
  "/que-es-genscore",
  "/cookies",
  "/privacidad",
  "/terminos",
  "/gratis"
]);
const ALLOWED_PREFIXES = ["/_next/", "/docs", "/blog", "/comparativas", "/glosario", "/geo", "/brand", "/preview"];

export function isLockdownActive(env: Record<string, string | undefined> = process.env): boolean {
  return env.VERCEL_ENV !== "production";
}

/** Decoded, slash-collapsed, lower-cased path; null when it cannot be trusted (traversal, backslash, bad encoding). */
export function normalisePath(raw: string): string | null {
  let path: string;
  try {
    path = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (path.includes("\\") || path.includes("\0")) return null;
  if (path.split("/").some((segment) => segment === ".." || segment === ".")) return null;
  path = path.replace(/\/{2,}/g, "/").toLowerCase();
  return path.length > 1 ? path.replace(/\/$/, "") : path;
}

export function decideLockdown(request: { method: string; pathname: string; hasServerActionHeader?: boolean }): LockdownDecision {
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") return { allow: false, reason: `el método ${method} no se sirve nunca en una vista previa` };
  if (request.hasServerActionHeader) return { allow: false, reason: "las acciones de servidor no se sirven nunca en una vista previa" };

  const path = normalisePath(request.pathname);
  if (path === null) return { allow: false, reason: "ruta no fiable" };
  if (ALLOWED_EXACT.has(path)) return { allow: true };
  if (ALLOWED_PREFIXES.some((prefix) => (prefix.endsWith("/") ? path.startsWith(prefix) : path === prefix || path.startsWith(`${prefix}/`)))) {
    return { allow: true };
  }
  return { allow: false, reason: "la ruta no está en la lista cerrada de páginas públicas de solo lectura" };
}

/** Headers added to EVERY response of a locked preview, allowed or not. */
export const LOCKDOWN_HEADERS: Record<string, string> = {
  "content-security-policy": "connect-src 'self'; form-action 'self'",
  "x-robots-tag": "noindex, nofollow",
  "x-preview-isolation": "locked",
  "cache-control": "no-store"
};

export function lockedBody(reason: string): string {
  return `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vista previa aislada</title>
<body style="font:16px/1.5 system-ui;max-width:34rem;margin:12vh auto;padding:0 20px;color:#0B1426">
<h1 style="font-size:22px">Vista previa aislada</h1>
<p>Esta ruta está desactivada en la vista previa: no escribe en ningún sistema real, no inicia cobros y no envía correos.</p>
<p style="color:#5B6B82;font-size:14px">Motivo: ${reason.replace(/[<>&]/g, "")}.</p>
<p><a href="/preview/index.html">Volver a la guía de la vista previa</a></p></body></html>`;
}
