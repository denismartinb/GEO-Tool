import type { ComponentProps } from "react";
import { loadSearchConsoleScreen } from "@/lib/search-console/load";
import { BlockIssuesCard } from "./block-panels";

/**
 * GSC-AUDIT-PAGES-1 (log §413): the SEO block's Problemas card with what
 * Search Console says about each affected page (clicks, position and the
 * search that brings the most). Same reading as Recomendaciones and the
 * Chrome panel (`loadSearchConsoleScreen` without inspections, 30-minute
 * `screen-rows` cache); nothing is stored.
 *
 * The page renders it inside a Suspense whose fallback is the plain card, so
 * Google never holds up the audit. Any state other than a live connection
 * renders the plain card: no invite here, it lives where Google's data shows.
 */
export async function SeoIssuesWithGoogle({
  projectId,
  ownerUserId,
  domain,
  ...card
}: Omit<ComponentProps<typeof BlockIssuesCard>, "google"> & { projectId: string; ownerUserId: string; domain: string }) {
  const state = await loadSearchConsoleScreen(projectId, ownerUserId, domain, [], [], false);
  return <BlockIssuesCard {...card} google={state.kind === "ready" && !state.report.empty ? state.insights.pageStats : null} />;
}
