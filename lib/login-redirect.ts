import { safeNextPath } from "@/lib/safe-next-path";

/**
 * LOGIN-NEXT-UTM-1. The request header the middleware fills with the path and
 * query of the page being opened, so `requireUser` can send a signed-out
 * visitor to `/login` and back to the same page after signing in.
 *
 * It only ever chooses where to land after login, and goes through
 * `safeNextPath` like every other `next`, so a forged value can at worst send
 * the user to another page of this same site. It authorizes nothing.
 */
export const REQUEST_PATH_HEADER = "x-gs-request-path";

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

/**
 * `/login` for a signed-out visitor who opened `requested` (path plus query).
 *
 * The UTM tags of the original link are copied to the login URL itself: the
 * first page the visitor sees is the login, and without them a click from a
 * lifecycle email read as direct traffic. They stay inside `next` as well, so
 * the destination page carries them too.
 */
export function loginRedirectPath(requested: string | null | undefined): string {
  const next = safeNextPath(requested);
  if (!next || next === "/login" || next.startsWith("/login?") || next.startsWith("/login/")) return "/login";

  const params = new URLSearchParams();
  params.set("next", next);
  const query = next.includes("?") ? next.slice(next.indexOf("?") + 1) : "";
  const original = new URLSearchParams(query.split("#")[0]);
  for (const key of UTM_KEYS) {
    const value = original.get(key);
    if (value) params.set(key, value.slice(0, 100));
  }
  return `/login?${params.toString()}`;
}
