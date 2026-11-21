import "server-only";

import { isIP } from "node:net";
import { AUDIT_USER_AGENT, PER_PAGE_TIMEOUT_MS, hostnameResolvesToPublicIp, isAllowedAuditHost } from "@/lib/web-audit/fetch-page";
import { classifyBotAnswer, PROBED_BOTS, type ServerProbeReport } from "@/lib/web-audit/server-probe";

/**
 * GEO-ALERTS-1 (log §440): asks the project's home page, once as ourselves
 * and once as each AI search bot, and compares. Four requests to one fixed URL
 * of the project's own domain, so it is not a crawler (founder-approved,
 * 2026-11-02). Same SSRF rules as `https-check.ts`: every hop must stay on the
 * domain and resolve to a public IP before it is requested, and redirects are
 * followed by hand. The body is never read.
 *
 * Never throws: anything we cannot settle is `unknown`, which no surface
 * reports as a problem.
 */

const MAX_REDIRECTS = 3;

type Answer = { status: number | null; challenged: boolean };

async function ask(projectDomainNormalized: string, userAgent: string, deadline: number): Promise<Answer> {
  let current: URL;
  try {
    current = new URL(`https://${projectDomainNormalized}/`);
  } catch {
    return { status: null, challenged: false };
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const hostname = current.hostname.toLowerCase();
    if (current.protocol !== "https:" || isIP(hostname) || !isAllowedAuditHost(hostname, projectDomainNormalized)) {
      return { status: null, challenged: false };
    }
    if (!(await hostnameResolvesToPublicIp(hostname))) return { status: null, challenged: false };

    const remaining = Math.min(PER_PAGE_TIMEOUT_MS, deadline - Date.now());
    if (remaining < 500) return { status: null, challenged: false };

    let response: Response;
    try {
      response = await fetch(current.toString(), {
        redirect: "manual",
        signal: AbortSignal.timeout(remaining),
        headers: { "user-agent": userAgent, accept: "text/html" }
      });
    } catch {
      return { status: null, challenged: false };
    }
    try {
      await response.body?.cancel();
    } catch {
      // best-effort: the body is never read
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return { status: null, challenged: false };
      try {
        current = new URL(location, current);
      } catch {
        return { status: null, challenged: false };
      }
      continue;
    }
    return { status: response.status, challenged: response.headers.has("cf-mitigated") };
  }
  return { status: null, challenged: false };
}

/** Bounded by `budgetMs` overall; the bots are asked in parallel after the baseline. */
export async function probeAiBotsOnServer(
  projectDomainNormalized: string,
  budgetMs = PER_PAGE_TIMEOUT_MS * 2
): Promise<ServerProbeReport> {
  const deadline = Date.now() + budgetMs;
  const measuredAt = new Date().toISOString();
  const baseline = await ask(projectDomainNormalized, AUDIT_USER_AGENT, deadline);
  const baselineOk = baseline.status !== null && baseline.status >= 200 && baseline.status < 300 && !baseline.challenged;
  if (!baselineOk) return { measuredAt, baseline: "unknown", engines: {} };

  const answers = await Promise.all(PROBED_BOTS.map((bot) => ask(projectDomainNormalized, bot.userAgent, deadline)));
  const engines: ServerProbeReport["engines"] = {};
  PROBED_BOTS.forEach((bot, i) => {
    engines[bot.engine] = {
      token: bot.token,
      state: classifyBotAnswer({ baselineOk, status: answers[i].status, challenged: answers[i].challenged }),
      status: answers[i].status
    };
  });
  return { measuredAt, baseline: "ok", engines };
}
