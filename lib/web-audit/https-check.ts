import "server-only";

import { isIP } from "node:net";
import { AUDIT_USER_AGENT, PER_PAGE_TIMEOUT_MS, hostnameResolvesToPublicIp, isAllowedAuditHost } from "@/lib/web-audit/fetch-page";
import type { HttpsRedirectState } from "@/lib/web-audit/seo-health";

/**
 * Does `http://<domain>/` send visitors to https? (Salud SEO, SEARCH-SEO-1
 * Fase 2, log §278.) One fixed URL on the project's own domain, so this is
 * not a crawler. Same SSRF rules as `fetchPageSafely`: every hop must stay on
 * the domain and resolve to a public IP before it is requested, and redirects
 * are followed by hand. The https target itself is never requested; reaching
 * it on the domain is the answer.
 *
 * Anything we cannot settle (DNS, timeout, a redirect off the domain, a 5xx)
 * is `unknown`, which the Salud SEO leaves out instead of calling it broken.
 */

const MAX_REDIRECTS = 3;

export async function checkHttpsRedirect(projectDomainNormalized: string): Promise<HttpsRedirectState> {
  let current: URL;
  try {
    current = new URL(`http://${projectDomainNormalized}/`);
  } catch {
    return "unknown";
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const hostname = current.hostname.toLowerCase();
    if (isIP(hostname) || !isAllowedAuditHost(hostname, projectDomainNormalized)) return "unknown";
    if (current.protocol === "https:") return "ok";
    if (current.protocol !== "http:") return "unknown";
    if (!(await hostnameResolvesToPublicIp(hostname))) return "unknown";

    let response: Response;
    try {
      response = await fetch(current.toString(), {
        redirect: "manual",
        signal: AbortSignal.timeout(PER_PAGE_TIMEOUT_MS),
        headers: { "user-agent": AUDIT_USER_AGENT }
      });
    } catch {
      return "unknown";
    }
    try {
      await response.body?.cancel();
    } catch {
      // best-effort: the body is never read
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return "unknown";
      try {
        current = new URL(location, current);
      } catch {
        return "unknown";
      }
      continue;
    }
    // The http version answered with a page of its own: no redirect.
    if (response.ok) return "missing";
    return "unknown";
  }
  return "unknown";
}
