import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * SSRF-hardened page fetcher for WEB-AUDIT-2 (technical audit). Candidate
 * URLs are never discovered here — see technical-audit.ts's
 * `selectCandidateUrls` — this module only fetches a URL it's given, and its
 * entire job is refusing to fetch anything that isn't genuinely a public page
 * on the audited project's own domain.
 *
 * data-guardian review (docs/specs/web-audit/phase-2-technical-audit.md)
 * required two things a naive `fetch()` doesn't give you:
 *
 * 1. Manual redirect handling. `fetch()` following redirects automatically
 *    means the request to a redirect target is already sent before any
 *    after-the-fact URL check could run — and the audited domain's own
 *    server (which the project owner controls) can redirect anywhere,
 *    including an internal address. Every hop is verified BEFORE it's
 *    followed, not after.
 * 2. Resolved-IP validation, not just hostname allowlisting. The project
 *    owner controls their own domain's DNS, so a subdomain's A record could
 *    point straight at a private/reserved IP with no redirect involved.
 *    Hostname matching alone can't catch that — every hostname is resolved
 *    and every returned address is checked before connecting.
 *
 * DNS-rebinding (the resolved-IP check and the actual TCP connect racing
 * against a DNS record that changes in between) is an accepted, flagged
 * residual risk — not solvable by a plain `fetch()`-based approach, and out
 * of scope for this phase.
 */

export const MAX_HTML_BYTES = 512 * 1024;
export const PER_PAGE_TIMEOUT_MS = 4_000;
const MAX_REDIRECTS = 3;

export const AUDIT_USER_AGENT = "GEOStudioAudit/1.0 (+https://genscore.es/bots)";

function isPrivateOrReservedIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return true; // fail closed on malformed
  const [a, b, c] = parts;
  if (a === 10) return true; // RFC1918
  if (a === 127) return true; // loopback
  if (a === 0) return true; // "this network"
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata 169.254.169.254
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT (RFC6598)
  if (a === 192 && b === 0 && c === 0) return true; // IETF protocol assignments
  if (a === 192 && b === 0 && c === 2) return true; // TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast (224-239) + reserved (240-255) + broadcast
  return false;
}

function isPrivateOrReservedIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::1" || normalized === "::") return true; // loopback / unspecified
  if (/^fe[89ab][0-9a-f]:/.test(normalized)) return true; // fe80::/10 link-local
  if (/^f[cd][0-9a-f]{2}:/.test(normalized)) return true; // fc00::/7 unique local
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateOrReservedIPv4(mapped[1]); // IPv4-mapped IPv6
  return false;
}

/** Fails closed: an unrecognized IP format is treated as private/reserved. */
export function isPrivateOrReservedIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateOrReservedIPv4(ip);
  if (version === 6) return isPrivateOrReservedIPv6(ip);
  return true;
}

/**
 * Resolves a hostname and confirms every returned address is public —
 * fails closed on a DNS error or an empty result (never "assume it's fine").
 */
export async function hostnameResolvesToPublicIp(hostname: string): Promise<boolean> {
  try {
    const results = await lookup(hostname, { all: true, verbatim: true });
    if (results.length === 0) return false;
    return results.every((r) => !isPrivateOrReservedIp(r.address));
  } catch {
    return false;
  }
}

/** Mirrors lib/recommendations/domain-coverage.ts's isSameOrSubdomain exactly (label-boundary match). */
export function isAllowedAuditHost(hostname: string, projectDomainNormalized: string): boolean {
  const h = hostname.toLowerCase();
  if (!h || !projectDomainNormalized) return false;
  return h === projectDomainNormalized || h.endsWith(`.${projectDomainNormalized}`);
}

async function verifyUrlIsSafe(url: URL, projectDomainNormalized: string): Promise<boolean> {
  if (url.protocol !== "https:") return false;
  const hostname = url.hostname.toLowerCase();
  if (isIP(hostname)) return false; // reject IP-literal hosts outright, never resolve/allow them
  if (!isAllowedAuditHost(hostname, projectDomainNormalized)) return false;
  return hostnameResolvesToPublicIp(hostname);
}

/** Reads a response body as text, stopping at maxBytes (a truncated body is still usable — checks are head-heavy). */
export async function readBodyCapped(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value && value.byteLength > 0) {
      const remaining = maxBytes - total;
      const chunk = value.byteLength > remaining ? value.slice(0, remaining) : value;
      chunks.push(chunk);
      total += chunk.byteLength;
    }
  }
  try {
    await reader.cancel();
  } catch {
    // best-effort cleanup only
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf-8");
}

export type PageFetchStatus =
  | "analyzed"
  | "skipped_offsite"
  | "skipped_not_html"
  | "skipped_timeout"
  | "skipped_error";

export type PageFetchResult =
  | { status: "analyzed"; html: string; finalUrl: string }
  | { status: Exclude<PageFetchStatus, "analyzed"> };

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

/**
 * Fetches one page, verifying every redirect hop before following it. Never
 * throws — every failure mode is a typed `status`, and the caller decides
 * what (if anything) to persist for a skipped page.
 */
export async function fetchPageSafely(rawUrl: string, projectDomainNormalized: string): Promise<PageFetchResult> {
  let current: URL;
  try {
    current = new URL(rawUrl);
  } catch {
    return { status: "skipped_offsite" };
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const safe = await verifyUrlIsSafe(current, projectDomainNormalized);
    if (!safe) return { status: "skipped_offsite" };

    let response: Response;
    try {
      response = await fetch(current.toString(), {
        redirect: "manual",
        signal: AbortSignal.timeout(PER_PAGE_TIMEOUT_MS),
        headers: { "user-agent": AUDIT_USER_AGENT }
      });
    } catch (error) {
      return { status: isTimeoutError(error) ? "skipped_timeout" : "skipped_offsite" };
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return { status: "skipped_offsite" };
      try {
        current = new URL(location, current);
      } catch {
        return { status: "skipped_offsite" };
      }
      continue; // next loop iteration re-verifies the NEW host before following
    }

    if (!response.ok) return { status: "skipped_offsite" };

    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (!contentType.includes("text/html")) return { status: "skipped_not_html" };

    const html = await readBodyCapped(response, MAX_HTML_BYTES);
    return { status: "analyzed", html, finalUrl: current.toString() };
  }

  return { status: "skipped_offsite" }; // exceeded MAX_REDIRECTS
}
