import { INS_TABS } from "./nav";

/**
 * APP-TABS-INSTANT-1 (log §390). The first screen of each bottom tab for the
 * project in `pathname`, minus the one already open. Pure: the in-app warm-up
 * prefetches exactly these, so the list is testable without a browser.
 */
export function tabPrefetchTargets(pathname: string): string[] {
  const m = /^\/dashboard\/projects\/([^/?#]+)(\/[^?#]*)?/.exec(pathname);
  if (!m) return [];
  const base = `/dashboard/projects/${m[1]}`;
  const here = `${base}${m[2] ?? ""}`.replace(/\/$/, "");
  return INS_TABS.map((t) => `${base}${t.segments[0]}`).filter((href) => href !== here);
}
