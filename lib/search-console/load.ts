import "server-only";

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
  buildSearchConsoleReport,
  searchWindows,
  type InspectionVerdict,
  type QueryRow,
  type SearchConsoleReport,
  type SearchTotals
} from "@/lib/search-console/report";

/**
 * SEARCH-SEO-1 Fase 3 (log §283). Decides what «Posición en Google» and the
 * Google half of Visión general's card can honestly show, and fetches it.
 *
 * Nothing is stored: every number is read live from Google on each render,
 * memoised per request only (`React.cache`). A shared data cache would have to
 * be keyed by project AND owner to never serve one account's Google data to
 * another (data-guardian review); per-request memo needs no such care.
 *
 * Callers pass ids they already verified (`requireActiveProject` +
 * `requireUser().user.id`).
 */

export const INSPECTION_LIMIT = 10;
const QUERY_ROW_LIMIT = 250;

export type SearchConsoleState =
  /** Missing key or OAuth client in Vercel: the feature is not offered. */
  | { kind: "not_configured" }
  /** Migration 0040 not applied yet. */
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

/** Refreshes the access token, re-encrypting the refresh token when needed. */
async function getAccess(ids: VerifiedIds, domain: string): Promise<Access | SearchConsoleState> {
  if (!isSearchConsoleCryptoConfigured() || !getOAuthClient()) return { kind: "not_configured" };
  const read = await readConnection(ids);
  if (read.kind !== "connected") return read.kind === "none" ? { kind: "disconnected" } : { kind: "unavailable" };
  const { connection } = read;
  if (connection.status !== "active") {
    return { kind: "reconnect", reason: connection.lastError === "permission" ? "permission" : "revoked" };
  }

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

    let property = connection.property;
    if (property) {
      return { accessToken: grant.accessToken, property };
    }
    const sites = await listSites(grant.accessToken);
    const candidates = rankMatchingProperties(
      sites.map((s) => s.siteUrl),
      domain
    );
    if (candidates.length === 1 && (await saveProperty(ids, candidates[0]))) {
      property = candidates[0];
      return { accessToken: grant.accessToken, property };
    }
    return { kind: "pick_property", candidates, verifiedCount: sites.length };
  } catch (error) {
    return fail(ids, error);
  }
}

function totals(rows: AnalyticsRow[]): SearchTotals {
  const row = rows[0];
  return row ? { clicks: row.clicks, impressions: row.impressions, position: row.position } : { clicks: 0, impressions: 0, position: 0 };
}

function queries(rows: AnalyticsRow[]): QueryRow[] {
  return rows.map((r) => ({ query: r.keys[0] ?? "", clicks: r.clicks, impressions: r.impressions, position: r.position }));
}

export type SearchConsoleScreen =
  | SearchConsoleState
  | {
      kind: "ready";
      property: string;
      report: SearchConsoleReport;
      /** Audited pages Google could not be asked about this time. */
      uninspected: number;
      window: { startDate: string; endDate: string };
    };

export const loadSearchConsoleScreen = cache(async function loadSearchConsoleScreen(
  projectId: string,
  ownerUserId: string,
  domain: string,
  pageUrls: string[]
): Promise<SearchConsoleScreen> {
  const ids = { projectId, ownerUserId };
  const access = await getAccess(ids, domain);
  if (!("accessToken" in access)) return access;
  const property = access.property!;
  const { current, previous } = searchWindows(new Date());
  const urls = [...new Set(pageUrls)].slice(0, INSPECTION_LIMIT);

  try {
    const [cur, prev, daily, curQ, prevQ, inspections] = await Promise.all([
      querySearchAnalytics(access.accessToken, property, current),
      querySearchAnalytics(access.accessToken, property, previous),
      querySearchAnalytics(access.accessToken, property, { ...current, dimensions: ["date"] }),
      querySearchAnalytics(access.accessToken, property, { ...current, dimensions: ["query"], rowLimit: QUERY_ROW_LIMIT }),
      querySearchAnalytics(access.accessToken, property, { ...previous, dimensions: ["query"], rowLimit: QUERY_ROW_LIMIT }),
      Promise.all(
        urls.map(async (url): Promise<InspectionVerdict | null> => {
          try {
            return { url, ...(await inspectUrl(access.accessToken, property, url)) };
          } catch {
            return null;
          }
        })
      )
    ]);
    const inspected = inspections.filter((i): i is InspectionVerdict => i !== null);
    return {
      kind: "ready",
      property,
      report: buildSearchConsoleReport({
        current: totals(cur),
        previous: totals(prev),
        daily: daily.map((r) => ({ date: r.keys[0] ?? "", clicks: r.clicks, impressions: r.impressions })),
        queries: queries(curQ),
        previousQueries: queries(prevQ),
        inspections: inspected
      }),
      uninspected: urls.length - inspected.length,
      window: current
    };
  } catch (error) {
    return fail(ids, error);
  }
});

export type SearchConsoleOverview =
  | SearchConsoleState
  | { kind: "ready"; report: Pick<SearchConsoleReport, "clicks" | "position" | "nearPage1" | "empty"> };

/** Visión general needs three calls, not the screen's full set. */
export const loadSearchConsoleOverview = cache(async function loadSearchConsoleOverview(
  projectId: string,
  ownerUserId: string,
  domain: string
): Promise<SearchConsoleOverview> {
  const ids = { projectId, ownerUserId };
  const access = await getAccess(ids, domain);
  if (!("accessToken" in access)) return access;
  const property = access.property!;
  const { current, previous } = searchWindows(new Date());
  try {
    const [cur, prev, curQ] = await Promise.all([
      querySearchAnalytics(access.accessToken, property, current),
      querySearchAnalytics(access.accessToken, property, previous),
      querySearchAnalytics(access.accessToken, property, { ...current, dimensions: ["query"], rowLimit: QUERY_ROW_LIMIT })
    ]);
    const report = buildSearchConsoleReport({
      current: totals(cur),
      previous: totals(prev),
      daily: [],
      queries: queries(curQ),
      previousQueries: [],
      inspections: null
    });
    return { kind: "ready", report };
  } catch (error) {
    return fail(ids, error);
  }
});
