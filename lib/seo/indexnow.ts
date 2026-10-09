import { SITE_URL } from "./metadata";

/**
 * IndexNow — GEO-SELF-1 Fase 1.
 *
 * IndexNow is how Bing (and through Bing, the engines that ground on its
 * index — ChatGPT search among them) learns that a URL changed without
 * waiting for its next crawl. The protocol needs two things: a key file
 * served from our own host, and a POST listing the URLs.
 *
 * **Dormant until `INDEXNOW_KEY` is set**, same pattern as
 * `GOOGLE_SITE_VERIFICATION`: without the variable the key route 404s and
 * every ping is a no-op that says so. It is deliberately NOT wired into the
 * build or a deploy hook (founder-approved scope): `pnpm indexnow:ping` is run
 * by hand after publishing.
 */

export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

/** Where the key file is served. Declared to IndexNow as `keyLocation`. */
export const INDEXNOW_KEY_PATH = "/indexnow-key.txt";

/** The protocol's own limit per request. */
const MAX_URLS_PER_REQUEST = 10_000;

/** The protocol accepts 8–128 chars of `a-z A-Z 0-9 -`. Anything else is a config error, not a key. */
const KEY_FORMAT = /^[A-Za-z0-9-]{8,128}$/;

export function getIndexNowKey(raw: string | undefined = process.env.INDEXNOW_KEY): string | null {
  const key = raw?.trim();
  return key && KEY_FORMAT.test(key) ? key : null;
}

export type IndexNowResult =
  | { status: "skipped"; reason: "no_key" | "no_urls" }
  | { status: "sent"; submitted: number; httpStatuses: number[] }
  | { status: "failed"; submitted: number; httpStatuses: number[]; error?: string };

/** Only URLs on our own host may be submitted with our key; anything else is dropped. */
export function ownUrls(urls: string[]): string[] {
  const host = new URL(SITE_URL).host;
  return [...new Set(urls)].filter((u) => {
    try {
      return new URL(u).host === host;
    } catch {
      return false;
    }
  });
}

export function buildIndexNowPayload(urls: string[], key: string) {
  return {
    host: new URL(SITE_URL).host,
    key,
    keyLocation: `${SITE_URL}${INDEXNOW_KEY_PATH}`,
    urlList: urls
  };
}

/**
 * Submits `urls` to IndexNow. No-op without a key. A non-2xx answer is a
 * failure, never a silent success: `fetch` resolves on 4xx/5xx
 * (`.claude/rules/scan.md`, "A dispatch is delivered only if the response says
 * so" — same lesson, different caller).
 */
export async function pingIndexNow(
  urls: string[],
  {
    key = getIndexNowKey(),
    fetchImpl = fetch,
    timeoutMs = 10_000
  }: { key?: string | null; fetchImpl?: typeof fetch; timeoutMs?: number } = {}
): Promise<IndexNowResult> {
  if (!key) return { status: "skipped", reason: "no_key" };
  const list = ownUrls(urls);
  if (list.length === 0) return { status: "skipped", reason: "no_urls" };

  const httpStatuses: number[] = [];
  for (let i = 0; i < list.length; i += MAX_URLS_PER_REQUEST) {
    const batch = list.slice(i, i + MAX_URLS_PER_REQUEST);
    try {
      const response = await fetchImpl(INDEXNOW_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(buildIndexNowPayload(batch, key)),
        signal: AbortSignal.timeout(timeoutMs)
      });
      httpStatuses.push(response.status);
      if (!response.ok) return { status: "failed", submitted: i, httpStatuses };
    } catch {
      return { status: "failed", submitted: i, httpStatuses, error: "transport_error" };
    }
  }
  return { status: "sent", submitted: list.length, httpStatuses };
}
