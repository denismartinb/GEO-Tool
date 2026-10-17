/**
 * AGENTIC-COMMERCE-1: what `/api/comercio-agentico/comprobar` answers and
 * what the landing renders. Shared by the route and the client, so it holds
 * types and constants only (no server code).
 *
 * The score («Visibilidad agéntica») is four weighted components. The fifth,
 * Interoperabilidad, is shown as «N de 4» protocols and stays out of the
 * total until the founder gives it a weight (`docs/adr/0043`).
 */

/** pass / avg / fail as in PageSpeed; `unknown` = we could not measure it, so it counts neither for nor against. */
export type CheckState = "pass" | "avg" | "fail" | "unknown";

export type AgenticComponentId = "discovery" | "understanding" | "trust" | "purchase";

export type AgenticCheck = {
  id: string;
  state: CheckState;
  /** What we saw, written for the store owner. */
  label: string;
  /** What to do about it. Present when the state is not `pass`. */
  fix?: string;
  /** Weight of this check inside its component (the component's checks add up to 100). */
  points: number;
};

export type AgenticComponentResult = {
  id: AgenticComponentId;
  name: string;
  /** Weight of the component in the total (30 / 30 / 20 / 20). */
  weight: number;
  /** 0–100 over the checks we could measure; `null` when none was measurable. */
  score: number | null;
  checks: AgenticCheck[];
};

export type InteropId = "ucp" | "mcp" | "a2a" | "feed";

export type InteropItem = {
  id: InteropId;
  label: string;
  /** `unknown` = we could not tell from outside (blocked, timeout). */
  state: "found" | "absent" | "unknown";
  detail: string;
};

export type AssistantName = "ChatGPT" | "Claude" | "Perplexity" | "Gemini";

export type AgentAccess = {
  assistant: AssistantName;
  /** `null` when robots.txt could not be read. */
  allowed: boolean | null;
};

export type AgenticFix = {
  component: AgenticComponentId;
  checkId: string;
  label: string;
  /** Points the total would rise if this check passed. */
  gain: number;
};

export type AgenticPageKind = "product" | "other";

/**
 * A few literal values the store published on the page (title, product,
 * price…), read as an agent without JavaScript reads them. The checker shows
 * them so the result speaks about THIS store. `null` = we could not read it.
 */
export type AgenticPageFacts = {
  title: string | null;
  productName: string | null;
  brand: string | null;
  price: string | null;
  availability: string | null;
  rating: string | null;
};

export type AgenticCheckResult = {
  domain: string;
  /** The page we analysed, after redirects. */
  url: string;
  pageKind: AgenticPageKind;
  /**
   * Whether we could read the page at all. `false` when the site answered
   * with a block or a challenge: then the page-level checks are `unknown`
   * and the landing says the site did not let us in, not «paste a product page».
   */
  pageRead: boolean;
  /** 0–100. `null` when the page is not a product page: Comprensión and Compra are measured on a product page. */
  score: number | null;
  components: AgenticComponentResult[];
  interop: { found: number; total: number; items: InteropItem[] };
  agents: AgentAccess[];
  /** Whether the site answered our identified bot with a challenge or a block. `null` = not measured. */
  challenge: boolean | null;
  /** Failing checks ordered by what they add to the total. */
  fixes: AgenticFix[];
  platform: string | null;
  /** `null` when the page could not be read. */
  facts: AgenticPageFacts | null;
  /**
   * Console only (log §323): how the product page was chosen. `given` = the
   * saved or pasted URL already was one; `catalog`/`sitemap`/`home` = found
   * automatically there; `none` = no product page found, so the result is
   * the home page. The free checker never sets it.
   */
  found?: AgenticProductFound;
};

export type AgenticProductFound = "given" | "catalog" | "sitemap" | "home" | "none";

export type AgenticCheckDenial =
  | "global_ceiling_reached"
  | "ip_limit_reached"
  | "domain_limit_reached"
  | "limit_check_failed";

export type AgenticCheckError =
  /** The text is not a URL or domain we accept. */
  | "invalid_url"
  /** We could not reach the page (DNS, timeout, private address, not HTML). */
  | "site_unreachable";

export type AgenticCheckResponse =
  | ({ status: "completed" } & AgenticCheckResult)
  | { status: "failed"; error: AgenticCheckError }
  | { status: "degraded"; reason: AgenticCheckDenial };

export const AGENTIC_SCORE_BANDS = { failBelow: 50, passFrom: 90 } as const;

export function agenticBand(score: number): "fail" | "avg" | "pass" {
  if (score < AGENTIC_SCORE_BANDS.failBelow) return "fail";
  if (score < AGENTIC_SCORE_BANDS.passFrom) return "avg";
  return "pass";
}
