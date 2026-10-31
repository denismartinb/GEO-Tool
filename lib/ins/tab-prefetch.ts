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

/** Same breakpoint as the bottom tab bar (MOBILE-TABBAR-1, log §380). */
export const TAB_BAR_MEDIA_QUERY = "(max-width: 760px)";

export type PrefetchEnv = {
  inApp: boolean;
  tabBarVisible: boolean;
  saveData?: boolean;
  effectiveType?: string;
};

/**
 * TABS-INSTANT-WEB-1 (log §391). Always inside the app; on the web only where
 * the bottom tab bar exists, and never with data saver or a slow connection.
 * Desktop already prefetches on hover from the side menu.
 */
export function shouldPrefetchTabs(env: PrefetchEnv): boolean {
  if (env.inApp) return true;
  if (!env.tabBarVisible) return false;
  if (env.saveData) return false;
  if (env.effectiveType && /(^|-)2g$|^3g$/.test(env.effectiveType)) return false;
  return true;
}
