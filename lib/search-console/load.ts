import "server-only";

import { createHash } from "node:crypto";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import {
  markConnectionFailed,
  readConnection,
  readTokenCiphertext,
  replaceCiphertext,
  saveProperty,
  type VerifiedIds
} from "@/lib/search-console/connection";
import { decryptRefreshToken, encryptRefreshToken, isSearchConsoleCryptoConfigured } from "@/lib/search-console/crypto";
import {
  GscError,
  getOAuthClient,
  inspectUrl,
  listSites,
  querySearchAnalytics,
  refreshAccessToken,
  type AnalyticsRow,
  type GscErrorCategory
} from "@/lib/search-console/google";
import { rankMatchingProperties } from "@/lib/search-console/property";
import {
  buildDeviceViews,
  buildPageViews,
  findCannibalization,
  findCtrOpportunities,
  findQuestionQueries,
  positionTiers,
  topPageByQuery,
  type AuditedPage,
  type Cannibalization,
  type CtrOpportunity,
  type DeviceView,
  type PageView,
  type QueryPageRow,
  type QuestionQuery,
  type TierShare
} from "@/lib/search-console/insights";
import {
  buildSearchConsoleReport,
  searchWindows,
  type InspectionVerdict,
  type QueryRow,
  type SearchConsoleReport,
  type SearchTotals
} from "@/lib/search-console/report";

/**
 * SEARCH-SEO-1 Fase 3 (log §284). Decides what «Posición en Google» and the
 * Google half of Visión general's card can honestly show, and fetches it.
 *
 * Nothing goes to our database. Google's raw rows are kept for
 * `GOOGLE_DATA_TTL_SECONDS` in Next's data cache (founder request 2026-10-11,
 * log §289), keyed by project AND owner AND property, so one account's Google
 * data can never answer for another (data-guardian review). The connection is
 * still read on every render before the cache: a disconnected or revoked
 * project shows nothing, cached or not. What depends on our own data (audit
 * pages, tracked prompts) is computed fresh on top of the cached rows.
 *
 * Callers pass ids they already verified (`requireActiveProject` +
 * `requireUser().user.id`).
 */

export const INSPECTION_LIMIT = 10;
const QUERY_ROW_LIMIT = 250;
const QUERY_PAGE_ROW_LIMIT = 1000;
const PAGE_ROW_LIMIT = 50;
/** Search Console data is daily and final: half an hour of reuse loses nothing. */
export const GOOGLE_DATA_TTL_SECONDS = 1800;

export type SearchConsoleState =
  /** Missing key or OAuth client in Vercel: the feature is not offered. */
  | { kind: "not_configured" }
  /** Migration 0041 not applied yet. */
  | { kind: "unavailable" }
  | { kind: "disconnected" }
  /** Access lost: revoked at Google, expired grant, or no permission on the property. */
  | { kind: "reconnect"; reason: "revoked" | "permission" }
  /** Connected, but several properties cover the domain (or none does). */
  | { kind: "pick_property"; candidates: string[]; verifiedCount: number }
  /** Google or the network failed this time; nothing is marked. */
  | { kind: "error"; category: GscErrorCategory };

type Access = { accessToken: string; property: string | null };

function isPersistent(category: GscErrorCategory): category is "revoked" | "permission" {
  return category === "revoked" || category === "permission";
}

async function fail(ids: VerifiedIds, error: unknown): Promise<SearchConsoleState> {
  const category = error instanceof GscError ? error.category : "unavailable";
  if (isPersistent(category)) {
    await markConnectionFailed(ids, category);
    return { kind: "reconnect", reason: category };
  }
  return { kind: "error", category };
}

type ActiveConnection = { property: string | null };

/** Config and connection checks only: our database, no call to Google. */
async function readActive(ids: VerifiedIds): Promise<ActiveConnection | SearchConsoleState> {
  if (!isSearchConsoleCryptoConfigured() || !getOAuthClient()) return { kind: "not_configured" };
  const read = await readConnection(ids);
  if (read.kind !== "connected") return read.kind === "none" ? { kind: "disconnected" } : { kind: "unavailable" };
  const { connection } = read;
  if (connection.status !== "active") {
    return {
      kind: "reconnect",
      reason: connection.lastError === "permission" ? "permission" : "revoked"
    };
  }
  return { property: connection.property };
}

/**
 * What Recomendaciones can show for Google, from our database only, no call
 * to Google. The page reads it before streaming the Google block, to reserve
 * its space only when the block can appear (log §298). "disconnected"/"reconnect" render the invitation to connect
 * (GSC-CONNECT-CTA-1, log §313); "off" (not configured, migration missing)
 * renders nothing, because a button that cannot work is worse than none.
 */
export type SearchConsoleAvailability = "active" | "disconnected" | "reconnect" | "off";

export async function readSearchConsoleAvailability(
  projectId: string,
  ownerUserId: string
): Promise<SearchConsoleAvailability> {
  const active = await readActive({ projectId, ownerUserId });
  if ("property" in active) return "active";
  if (active.kind === "disconnected" || active.kind === "reconnect") return active.kind;
  return "off";
}

/** Refreshes the access token, re-encrypting the refresh token when needed. */
async function getAccess(ids: VerifiedIds, domain: string, active: ActiveConnection): Promise<Access | SearchConsoleState> {
  const ciphertext = await readTokenCiphertext(ids);
  const decrypted = ciphertext ? decryptRefreshToken(ciphertext, ids.projectId, ids.ownerUserId) : null;
  if (!decrypted) {
    // A token this deployment cannot read (key rotated away) is as good as revoked.
    await markConnectionFailed(ids, "revoked");
    return { kind: "reconnect", reason: "revoked" };
  }

  try {
    const grant = await refreshAccessToken(decrypted.token);
    if (grant.refreshToken && grant.refreshToken !== decrypted.token) {
      await replaceCiphertext(ids, encryptRefreshToken(grant.refreshToken, ids.projectId, ids.ownerUserId));
    } else if (decrypted.needsReencrypt) {
      await replaceCiphertext(ids, encryptRefreshToken(decrypted.token, ids.projectId, ids.ownerUserId));
    }

    if (active.property) {
      return { accessToken: grant.accessToken, property: active.property };
    }
    const sites = await listSites(grant.accessToken);
    const candidates = rankMatchingProperties(
      sites.map((s) => s.siteUrl),
      domain
    );
    if (candidates.length === 1 && (await saveProperty(ids, candidates[0]))) {
      return { accessToken: grant.accessToken, property: candidates[0] };
    }
    return { kind: "pick_property", candidates, verifiedCount: sites.length };
  } catch (error) {
    return fail(ids, error);
  }
}

/** Carries a non-ready state out of a cached fetch, so it is never cached. */
class StateSignal extends Error {
  constructor(readonly state: SearchConsoleState) {
    super("search-console state");
  }
}

/**
 * Runs `fetchRows` with a fresh access token, reusing the last result for this
 * project, owner, property and key for `GOOGLE_DATA_TTL_SECONDS`. A hit makes
 * no call to Google at all, not even the token refresh. Failures and non-ready
 * states are never cached. Without a property yet (first visit), nothing is
 * cached: the property is decided on the way.
 */
async function withGoogleData<T>(
  ids: VerifiedIds,
  domain: string,
  active: ActiveConnection,
  key: string[],
  fetchRows: (access: Access & { property: string }) => Promise<T>
): Promise<{ property: string; rows: T } | SearchConsoleState> {
  const run = async () => {
    const access = await getAccess(ids, domain, active);
    if (!("accessToken" in access)) throw new StateSignal(access);
    const property = access.property!;
    try {
      return {
        property,
        rows: await fetchRows({ accessToken: access.accessToken, property })
      };
    } catch (error) {
      throw new StateSignal(await fail(ids, error));
    }
  };
  try {
    if (!active.property) return await run();
    // The token lives only in `run`'s closure; it is never part of the key.
    return await unstable_cache(run, ["gsc", ids.projectId, ids.ownerUserId, active.property, ...key], {
      revalidate: GOOGLE_DATA_TTL_SECONDS
    })();
  } catch (error) {
    if (error instanceof StateSignal) return error.state;
    throw error;
  }
}

function shortHash(values: string[]): string {
  return createHash("sha256").update(values.join("\n")).digest("hex").slice(0, 16);
}

function totals(rows: AnalyticsRow[]): SearchTotals {
  const row = rows[0];
  return row
    ? {
        clicks: row.clicks,
        impressions: row.impressions,
        position: row.position
      }
    : { clicks: 0, impressions: 0, position: 0 };
}

function queries(rows: AnalyticsRow[]): QueryRow[] {
  return rows.map((r) => ({
    query: r.keys[0] ?? "",
    clicks: r.clicks,
    impressions: r.impressions,
    position: r.position
  }));
}

/** What the screen reads beyond the totals (log §287). */
export type SearchConsoleInsights = {
  tiers: TierShare[];
  /** The page Google shows most for each query. */
  pageByQuery: Record<string, string>;
  pages: PageView[];
  ctr: CtrOpportunity[];
  questions: QuestionQuery[];
  devices: DeviceView[];
  cannibalization: Cannibalization[];
};

export type SearchConsoleScreen =
  | SearchConsoleState
  | {
      kind: "ready";
      property: string;
      report: SearchConsoleReport;
      insights: SearchConsoleInsights;
      /** Audited pages Google could not be asked about this time. */
      uninspected: number;
      window: { startDate: string; endDate: string };
    };

export const loadSearchConsoleScreen = cache(async function loadSearchConsoleScreen(
  projectId: string,
  ownerUserId: string,
  domain: string,
  /** Pages of the latest technical audit, with their SEO problem count. */
  auditedPages: AuditedPage[],
  /** Active prompt texts, to tell which Google questions are already tracked in the AI scan. */
  trackedPrompts: string[],
  /**
   * Ask Google about the audited pages' indexing. Recomendaciones doesn't use
   * it and passes false: the inspections are the slow half of a cache miss.
   */
  inspect = true
): Promise<SearchConsoleScreen> {
  const ids = { projectId, ownerUserId };
  const active = await readActive(ids);
  if (!("property" in active)) return active;
  const { current, previous } = searchWindows(new Date());
  const urls = [...new Set(auditedPages.map((p) => p.url))].slice(0, INSPECTION_LIMIT);

  // Two cache entries (log §298): the search analytics, shared by «Posición en
  // Google» and Recomendaciones, and the URL inspections, which only the
  // screen reads and which take most of a miss. Same three-part key prefix.
  const analytics = withGoogleData(
    ids,
    domain,
    active,
    ["screen-rows", current.endDate],
    async ({ accessToken, property }) => {
      const [cur, prev, daily, curQ, prevQ, queryPage, pageRows, deviceRows] = await Promise.all([
        querySearchAnalytics(accessToken, property, current),
        querySearchAnalytics(accessToken, property, previous),
        querySearchAnalytics(accessToken, property, {
          ...current,
          dimensions: ["date"]
        }),
        querySearchAnalytics(accessToken, property, {
          ...current,
          dimensions: ["query"],
          rowLimit: QUERY_ROW_LIMIT
        }),
        querySearchAnalytics(accessToken, property, {
          ...previous,
          dimensions: ["query"],
          rowLimit: QUERY_ROW_LIMIT
        }),
        querySearchAnalytics(accessToken, property, {
          ...current,
          dimensions: ["query", "page"],
          rowLimit: QUERY_PAGE_ROW_LIMIT
        }),
        querySearchAnalytics(accessToken, property, {
          ...current,
          dimensions: ["page"],
          rowLimit: PAGE_ROW_LIMIT
        }),
        querySearchAnalytics(accessToken, property, {
          ...current,
          dimensions: ["device"]
        })
      ]);
      return { cur, prev, daily, curQ, prevQ, queryPage, pageRows, deviceRows };
    }
  );
  const inspectionsCall = () =>
    inspect && urls.length > 0
      ? withGoogleData(ids, domain, active, ["inspections", current.endDate, shortHash(urls)], ({ accessToken, property }) =>
          Promise.all(
            urls.map(async (url): Promise<InspectionVerdict | null> => {
              try {
                return {
                  url,
                  ...(await inspectUrl(accessToken, property, url))
                };
              } catch {
                return null;
              }
            })
          )
        )
      : null;
  // Without a stored property yet, the first call decides it: no race.
  const [data, inspectionData] = active.property
    ? await Promise.all([analytics, inspectionsCall()])
    : [await analytics, await inspectionsCall()];
  if (!("rows" in data)) return data;
  if (inspectionData && !("rows" in inspectionData)) return inspectionData;
  const { property } = data;
  const { cur, prev, daily, curQ, prevQ, queryPage, pageRows, deviceRows } = data.rows;
  const inspections = inspectionData ? inspectionData.rows : null;

  const inspected = inspections?.filter((i): i is InspectionVerdict => i !== null) ?? null;
  const report = buildSearchConsoleReport({
    current: totals(cur),
    previous: totals(prev),
    daily: daily.map((r) => ({
      date: r.keys[0] ?? "",
      clicks: r.clicks,
      impressions: r.impressions,
      position: r.position
    })),
    queries: queries(curQ),
    previousQueries: queries(prevQ),
    inspections: inspected
  });
  const qp: QueryPageRow[] = queryPage.map((r) => ({
    query: r.keys[0] ?? "",
    page: r.keys[1] ?? "",
    clicks: r.clicks,
    impressions: r.impressions,
    position: r.position
  }));
  const pageByQuery = topPageByQuery(qp);
  return {
    kind: "ready",
    property,
    report,
    insights: {
      tiers: positionTiers(report.queries),
      pageByQuery: Object.fromEntries(pageByQuery),
      pages: buildPageViews(
        pageRows.map((r) => ({
          page: r.keys[0] ?? "",
          clicks: r.clicks,
          impressions: r.impressions,
          position: r.position
        })),
        qp,
        auditedPages
      ),
      ctr: findCtrOpportunities(report.queries, pageByQuery),
      questions: findQuestionQueries(report.queries, trackedPrompts),
      devices: buildDeviceViews(
        deviceRows.map((r) => ({
          device: r.keys[0] ?? "",
          clicks: r.clicks,
          impressions: r.impressions,
          position: r.position
        }))
      ),
      cannibalization: findCannibalization(qp)
    },
    uninspected: inspected ? urls.length - inspected.length : 0,
    window: current
  };
});

export type SearchConsoleOverview =
  | SearchConsoleState
  | {
      kind: "ready";
      report: Pick<SearchConsoleReport, "clicks" | "position" | "nearPage1" | "empty">;
    };

/** Visión general needs three calls, not the screen's full set. */
export const loadSearchConsoleOverview = cache(async function loadSearchConsoleOverview(
  projectId: string,
  ownerUserId: string,
  domain: string
): Promise<SearchConsoleOverview> {
  const ids = { projectId, ownerUserId };
  const active = await readActive(ids);
  if (!("property" in active)) return active;
  const { current, previous } = searchWindows(new Date());
  const data = await withGoogleData(ids, domain, active, ["overview", current.endDate], async ({ accessToken, property }) => {
    const [cur, prev, curQ] = await Promise.all([
      querySearchAnalytics(accessToken, property, current),
      querySearchAnalytics(accessToken, property, previous),
      querySearchAnalytics(accessToken, property, {
        ...current,
        dimensions: ["query"],
        rowLimit: QUERY_ROW_LIMIT
      })
    ]);
    return { cur, prev, curQ };
  });
  if (!("rows" in data)) return data;
  const { cur, prev, curQ } = data.rows;
  const report = buildSearchConsoleReport({
    current: totals(cur),
    previous: totals(prev),
    daily: [],
    queries: queries(curQ),
    previousQueries: [],
    inspections: null
  });
  return { kind: "ready", report };
});
