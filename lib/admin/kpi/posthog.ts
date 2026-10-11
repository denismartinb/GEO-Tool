import "server-only";

import { unstable_cache } from "next/cache";
import { SITE_URL } from "@/lib/seo/metadata";
import { groupChannels, type ChannelRow } from "@/lib/admin/kpi/channels";
import { VITAL_THRESHOLDS, vitalView, type VitalKey, type VitalView } from "@/lib/admin/kpi/model";
import { lastMadridDates, PANEL_TIME_ZONE, type PanelWindow } from "@/lib/admin/kpi/period";

/**
 * ADMIN-PANEL-1 — the web half of /admin/panel, read from PostHog's Query API
 * (HogQL) with a personal API key that only has `query:read`.
 *
 * The browser SDK is cookieless (`components/posthog-provider.tsx`), so a
 * session is roughly one page load: the panel says «visitas». Only our public
 * site counts: the console, /admin, /mfa and /auth are left out, and so is
 * any other host (previews, localhost).
 *
 * Results are cached for `PANEL_CACHE_SECONDS` under `PANEL_CACHE_TAG`; the
 * panel's «Actualizar» button clears that tag. The key holds the window
 * rounded to that same ten minutes, never the API key.
 */

export const PANEL_CACHE_TAG = "admin-panel";
export const PANEL_CACHE_SECONDS = 600;

const QUERY_TIMEOUT_MS = 15_000;
const SITE_HOST = new URL(SITE_URL).host;
/** Paths that are not marketing traffic: the product itself and operator screens. */
const EXCLUDED_PATH_PREFIXES = ["/dashboard", "/admin", "/mfa", "/auth", "/informe"];

type PosthogConfig = { apiKey: string; projectId: string; host: string };

function readConfig(): PosthogConfig | null {
  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY?.trim();
  const projectId = process.env.POSTHOG_PROJECT_ID?.trim();
  if (!apiKey || !projectId || !/^\d+$/.test(projectId)) return null;
  const host = (process.env.POSTHOG_API_HOST ?? "https://eu.posthog.com").trim().replace(/\/+$/, "");
  return { apiKey, projectId, host };
}

export function isPosthogQueryConfigured(): boolean {
  return readConfig() !== null;
}

type HogQLResult = { columns: string[]; results: unknown[][] };

async function runHogQL(config: PosthogConfig, query: string): Promise<HogQLResult> {
  const response = await fetch(`${config.host}/api/projects/${config.projectId}/query/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query }, name: "admin-panel" }),
    signal: AbortSignal.timeout(QUERY_TIMEOUT_MS),
    cache: "no-store"
  });
  if (!response.ok) {
    // Status only: the body can echo the query, and the key is in the request.
    throw new Error(`posthog query rejected with status ${response.status}`);
  }
  const body = (await response.json()) as { columns?: string[]; results?: unknown[][] };
  return { columns: body.columns ?? [], results: body.results ?? [] };
}

/** `2026-10-11 17:54:00` in UTC — the project's timezone is UTC. */
function sqlTime(date: Date): string {
  return `toDateTime('${date.toISOString().slice(0, 19).replace("T", " ")}')`;
}

function pageviewFilter(from: Date, to: Date): string {
  const paths = EXCLUDED_PATH_PREFIXES.map((p) => `properties.$pathname LIKE '${p}%'`).join(" OR ");
  return [
    "event = '$pageview'",
    `timestamp >= ${sqlTime(from)}`,
    `timestamp < ${sqlTime(to)}`,
    `properties.$host = '${SITE_HOST}'`,
    `NOT (${paths})`
  ].join(" AND ");
}

function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export type WebTotals = {
  visits: number;
  previousVisits: number;
  spainVisits: number;
  mobile: number;
  desktop: number;
  rageClicks: number;
};

export type WebSection =
  | { kind: "not_configured" }
  | { kind: "error" }
  | {
      kind: "ready";
      /** End of the window actually queried (rounded down to the cache bucket). */
      asOf: string;
      totals: WebTotals;
      /** Last 28 Madrid days, oldest first. */
      daily: Array<{ date: string; visits: number }>;
      channels: ChannelRow[];
      entryPages: Array<{ path: string; visits: number }>;
      vitals: VitalView[];
    };

type WindowKey = { from: string; to: string; prevFrom: string; prevTo: string; dailyFrom: string };

async function fetchWeb(config: PosthogConfig, key: WindowKey, dailyDates: string[]): Promise<Omit<Extract<WebSection, { kind: "ready" }>, "kind" | "asOf">> {
  const from = new Date(key.from);
  const to = new Date(key.to);
  const prevFrom = new Date(key.prevFrom);
  const prevTo = new Date(key.prevTo);
  const sid = "properties.$session_id";
  const inCur = `timestamp >= ${sqlTime(from)} AND timestamp < ${sqlTime(to)}`;

  const totalsQuery = `
    SELECT
      uniqIf(${sid}, ${inCur}) AS visits,
      uniqIf(${sid}, timestamp < ${sqlTime(prevTo)}) AS previous_visits,
      uniqIf(${sid}, ${inCur} AND properties.$geoip_country_code = 'ES') AS spain,
      uniqIf(${sid}, ${inCur} AND properties.$device_type = 'Mobile') AS mobile,
      uniqIf(${sid}, ${inCur} AND properties.$device_type = 'Desktop') AS desktop
    FROM events
    WHERE ${pageviewFilter(prevFrom, to)}`;

  const rageQuery = `
    SELECT count() FROM events
    WHERE event = '$rageclick' AND ${inCur} AND properties.$host = '${SITE_HOST}'`;

  const dailyQuery = `
    SELECT toString(toDate(toTimeZone(timestamp, '${PANEL_TIME_ZONE}'))) AS day, uniq(${sid}) AS visits
    FROM events
    WHERE ${pageviewFilter(new Date(key.dailyFrom), to)}
    GROUP BY day
    ORDER BY day`;

  const sourcesQuery = `
    SELECT src, count() AS visits FROM (
      SELECT ${sid} AS s,
        argMin(coalesce(nullIf(lower(toString(properties.utm_source)), ''), nullIf(toString(properties.$referring_domain), ''), '$direct'), timestamp) AS src
      FROM events
      WHERE ${pageviewFilter(from, to)}
      GROUP BY s)
    GROUP BY src
    ORDER BY visits DESC
    LIMIT 200`;

  const entryQuery = `
    SELECT entry, count() AS visits FROM (
      SELECT ${sid} AS s, argMin(toString(properties.$pathname), timestamp) AS entry
      FROM events
      WHERE ${pageviewFilter(from, to)}
      GROUP BY s)
    GROUP BY entry
    ORDER BY visits DESC
    LIMIT 8`;

  const vitalColumns = (Object.keys(VITAL_THRESHOLDS) as VitalKey[])
    .map((k) => {
      const prop = `properties.$web_vitals_${k}_value`;
      const [good, poor] = VITAL_THRESHOLDS[k];
      return [
        `countIf(${prop} IS NOT NULL) AS ${k}_n`,
        `countIf(${prop} IS NOT NULL AND toFloat(${prop}) <= ${good}) AS ${k}_good`,
        `countIf(${prop} IS NOT NULL AND toFloat(${prop}) > ${poor}) AS ${k}_poor`
      ].join(", ");
    })
    .join(", ");
  const vitalsQuery = `
    SELECT ${vitalColumns}
    FROM events
    WHERE event = '$web_vitals' AND ${inCur} AND properties.$host = '${SITE_HOST}'`;

  const [totals, rage, daily, sources, entries, vitals] = await Promise.all([
    runHogQL(config, totalsQuery),
    runHogQL(config, rageQuery),
    runHogQL(config, dailyQuery),
    runHogQL(config, sourcesQuery),
    runHogQL(config, entryQuery),
    runHogQL(config, vitalsQuery)
  ]);

  const t = totals.results[0] ?? [];
  const dailyByDate = new Map(daily.results.map((row) => [String(row[0]), num(row[1])]));
  const v = vitals.results[0] ?? [];
  const vitalViews = (Object.keys(VITAL_THRESHOLDS) as VitalKey[])
    .map((k, i) => vitalView(k, { total: num(v[i * 3]), good: num(v[i * 3 + 1]), poor: num(v[i * 3 + 2]) }))
    .filter((view): view is VitalView => view !== null);

  return {
    totals: {
      visits: num(t[0]),
      previousVisits: num(t[1]),
      spainVisits: num(t[2]),
      mobile: num(t[3]),
      desktop: num(t[4]),
      rageClicks: num(rage.results[0]?.[0])
    },
    daily: dailyDates.map((date) => ({ date, visits: dailyByDate.get(date) ?? 0 })),
    channels: groupChannels(sources.results.map((row) => ({ source: row[0] == null ? null : String(row[0]), visits: num(row[1]) }))),
    entryPages: entries.results.map((row) => ({ path: String(row[0] ?? ""), visits: num(row[1]) })),
    vitals: vitalViews
  };
}

const BUCKET_MS = PANEL_CACHE_SECONDS * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Window edges rounded down to the cache bucket, so every load inside the same
 * ten minutes shares one cache entry instead of a new key per request.
 */
function floorToBucket(date: Date): string {
  return new Date(Math.floor(date.getTime() / BUCKET_MS) * BUCKET_MS).toISOString();
}

export async function loadWebSection(window: PanelWindow, now: Date): Promise<WebSection> {
  const config = readConfig();
  if (!config) return { kind: "not_configured" };
  const dailyDates = lastMadridDates(now, 28);
  // The chart starts at Madrid midnight of its first day; 30 days back covers it with room for DST.
  const key: WindowKey = {
    from: floorToBucket(window.from),
    to: floorToBucket(window.to),
    prevFrom: floorToBucket(window.prevFrom),
    prevTo: floorToBucket(window.prevTo),
    dailyFrom: floorToBucket(new Date(now.getTime() - 30 * DAY_MS))
  };
  try {
    const data = await unstable_cache(() => fetchWeb(config, key, dailyDates), ["admin-panel-web", window.id, key.from, key.to], {
      revalidate: PANEL_CACHE_SECONDS,
      tags: [PANEL_CACHE_TAG]
    })();
    return { kind: "ready", asOf: key.to, ...data };
  } catch (error) {
    console.error("[geo:admin] panel could not read PostHog", {
      message: error instanceof Error ? error.message : "unknown"
    });
    return { kind: "error" };
  }
}
