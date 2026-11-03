import "server-only";

/**
 * AI-READ-2 (log §451): the rendered HTML of a public page, from Cloudflare
 * Browser Run's `/content` Quick Action, on the free Workers plan (10 browser
 * minutes a day, one request every 10 seconds). Only the project's own pages
 * that the technical audit already chose are ever sent, so this is not a
 * crawler: Cloudflare opens exactly one URL and follows no links.
 *
 * Without CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_BROWSER_TOKEN nothing is called
 * and the console keeps what the HTML alone shows.
 */

export type BrowserRunOutcome =
  | { kind: "ok"; html: string }
  /** The daily free minutes or the request rate ran out: stop the pass, try later. */
  | { kind: "quota" }
  /** Token or account wrong: stop the pass. */
  | { kind: "config" }
  /** This page failed (timeout, navigation error): try it again another day. */
  | { kind: "page_failed" };

/** Free plan: one request every 10 seconds. */
export const BROWSER_RUN_MIN_GAP_MS = 10_500;
const MAX_RENDERED_BYTES = 3 * 1024 * 1024;

export function browserRunConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.CLOUDFLARE_ACCOUNT_ID?.trim() && env.CLOUDFLARE_BROWSER_TOKEN?.trim());
}

export async function renderWithBrowserRun(
  url: string,
  opts: { timeoutMs: number; fetchImpl?: typeof fetch; env?: NodeJS.ProcessEnv }
): Promise<BrowserRunOutcome> {
  const env = opts.env ?? process.env;
  const account = env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = env.CLOUDFLARE_BROWSER_TOKEN?.trim();
  if (!account || !token) return { kind: "config" };
  const doFetch = opts.fetchImpl ?? fetch;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), Math.max(1_000, opts.timeoutMs));
  try {
    const body = JSON.stringify({
      url,
      gotoOptions: { waitUntil: "networkidle2", timeout: Math.max(1_000, opts.timeoutMs - 3_000) },
      rejectResourceTypes: ["image", "media", "font", "stylesheet"]
    });
    const call = (path: string) =>
      doFetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/${path}/content`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body,
        signal: ctl.signal,
        cache: "no-store"
      });
    // «Browser Run» was «Browser Rendering» until 2026; the old path is the fallback.
    let res = await call("browser-run");
    if (res.status === 404) res = await call("browser-rendering");
    if (res.status === 429) return { kind: "quota" };
    if (res.status === 401 || res.status === 403) return { kind: "config" };
    if (!res.ok) return { kind: "page_failed" };
    const text = await res.text();
    if (text.length > MAX_RENDERED_BYTES * 2) return { kind: "page_failed" };
    let parsed: { success?: boolean; result?: unknown };
    try {
      parsed = JSON.parse(text) as { success?: boolean; result?: unknown };
    } catch {
      return { kind: "page_failed" };
    }
    if (!parsed.success || typeof parsed.result !== "string" || parsed.result.length === 0) return { kind: "page_failed" };
    return { kind: "ok", html: parsed.result.slice(0, MAX_RENDERED_BYTES) };
  } catch {
    return { kind: "page_failed" };
  } finally {
    clearTimeout(timer);
  }
}
