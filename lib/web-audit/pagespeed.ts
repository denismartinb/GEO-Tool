import "server-only";

import { parsePageSpeedResponse, type DeviceSpeed, type PageSpeedReport } from "@/lib/web-audit/seo-health";

/**
 * Core Web Vitals of the home page from Google's free PageSpeed Insights API
 * (SEARCH-SEO-1 Fase 2, log §281). Needs `PAGESPEED_API_KEY`; without it
 * nothing is called and the speed card is not drawn (`undefined`), because a
 * number we did not measure is not shown.
 *
 * Both strategies run in parallel under one timeout that fits inside the
 * technical audit's own budget (ADR 0003). There is no retry: a failed
 * measurement is `null`, and the next audit tries again. The key travels in
 * the query string, so the request URL is never logged.
 */

const ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
export const PAGESPEED_TIMEOUT_MS = 20_000;
const LOG_PREFIX = "[geo:pagespeed]";

export function pageSpeedApiKey(): string | null {
  const key = process.env.PAGESPEED_API_KEY?.trim();
  return key ? key : null;
}

async function runStrategy(url: string, strategy: "mobile" | "desktop", key: string, timeoutMs: number): Promise<DeviceSpeed | null> {
  const query = new URLSearchParams({ url, strategy, category: "performance", key });
  try {
    const response = await fetch(`${ENDPOINT}?${query.toString()}`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) {
      console.warn(`${LOG_PREFIX} http_error`, { strategy, status: response.status });
      return null;
    }
    return parsePageSpeedResponse(await response.json());
  } catch (error) {
    console.warn(`${LOG_PREFIX} request_failed`, {
      strategy,
      error_name: error instanceof Error ? error.name : "unknown"
    });
    return null;
  }
}

export async function fetchPageSpeed(
  url: string,
  options: { timeoutMs?: number; now?: Date } = {}
): Promise<PageSpeedReport | null | undefined> {
  const key = pageSpeedApiKey();
  if (!key) return undefined;
  const timeoutMs = options.timeoutMs ?? PAGESPEED_TIMEOUT_MS;
  const [mobile, desktop] = await Promise.all([
    runStrategy(url, "mobile", key, timeoutMs),
    runStrategy(url, "desktop", key, timeoutMs)
  ]);
  if (!mobile && !desktop) return null;
  return { measuredAt: (options.now ?? new Date()).toISOString(), mobile, desktop };
}
