import "server-only";

import { isIP } from "node:net";
import {
  AUDIT_USER_AGENT,
  hostnameResolvesToPublicIp,
  isAllowedAuditHost,
  readBodyCapped
} from "@/lib/web-audit/fetch-page";

/**
 * AGENTIC-COMMERCE-1 — fetches one URL on the store's own domain and keeps
 * what `fetchPageSafely` throws away: the status, a few headers and the body
 * of a 403 or 503. Those are exactly what tell a challenge from a page.
 *
 * The SSRF guard is the web audit's, imported, never copied
 * (`.claude/rules/scan.md`): https only, no IP literals, the host must be
 * the store's domain or a subdomain of it, every resolved address public,
 * and every redirect hop verified before it is followed.
 *
 * Never throws. Identifies itself as GenScore's bot, never as an assistant.
 */

const MAX_REDIRECTS = 3;
const KEPT_HEADERS = ["content-type", "cf-mitigated", "server", "x-robots-tag"] as const;

export type AgenticFetchResult =
  | {
      kind: "response";
      status: number;
      finalUrl: string;
      headers: Record<string, string | undefined>;
      body: string;
      ms: number;
    }
  | { kind: "error"; reason: "offsite" | "unsafe_ip" | "timeout" | "network" | "too_many_redirects" };

export async function fetchOnDomain(
  rawUrl: string,
  baseDomain: string,
  options: { timeoutMs: number; maxBytes: number; deadlineAt?: number }
): Promise<AgenticFetchResult> {
  const startedAt = Date.now();
  let current: URL;
  try {
    current = new URL(rawUrl);
  } catch {
    return { kind: "error", reason: "offsite" };
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const host = current.hostname.toLowerCase();
    if (current.protocol !== "https:" || isIP(host) || !isAllowedAuditHost(host, baseDomain)) {
      return { kind: "error", reason: "offsite" };
    }
    if (!(await hostnameResolvesToPublicIp(host))) return { kind: "error", reason: "unsafe_ip" };

    // The budget belongs to the invocation, not to this call.
    const remaining = options.deadlineAt ? options.deadlineAt - Date.now() : options.timeoutMs;
    const timeout = Math.min(options.timeoutMs, remaining);
    if (timeout < 250) return { kind: "error", reason: "timeout" };

    let response: Response;
    try {
      response = await fetch(current.toString(), {
        redirect: "manual",
        signal: AbortSignal.timeout(timeout),
        headers: { "user-agent": AUDIT_USER_AGENT, accept: "text/html,application/json;q=0.9,*/*;q=0.8" }
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      return { kind: "error", reason: name === "TimeoutError" || name === "AbortError" ? "timeout" : "network" };
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      try {
        await response.body?.cancel();
      } catch {
        // best-effort
      }
      if (!location) return { kind: "error", reason: "network" };
      try {
        current = new URL(location, current);
      } catch {
        return { kind: "error", reason: "offsite" };
      }
      continue;
    }

    const headers: Record<string, string | undefined> = {};
    for (const name of KEPT_HEADERS) headers[name] = response.headers.get(name) ?? undefined;

    let body = "";
    try {
      body = await readBodyCapped(response, options.maxBytes);
    } catch {
      body = "";
    }
    return { kind: "response", status: response.status, finalUrl: current.toString(), headers, body, ms: Date.now() - startedAt };
  }

  return { kind: "error", reason: "too_many_redirects" };
}
