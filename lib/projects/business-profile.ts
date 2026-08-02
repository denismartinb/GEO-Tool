import "server-only";
import { fetchPageSafely } from "@/lib/web-audit/fetch-page";
import { inferBrandAliases, inferBusinessProfile, type BusinessProfile } from "@/lib/llm/gemini";
import { selectVerifiableAliases } from "@/lib/projects/brand-aliases";

/**
 * COMPETITOR-GROUNDING-1: gives Gemini real evidence of what a business
 * actually does before asking it to infer competitors/prompts. Without this,
 * suggestCompetitors/suggestPrompts (lib/llm/gemini.ts) had nothing to reason
 * from but the domain string itself — which works for globally famous brands
 * (present in the model's training data) and fails for SMEs/agencies, where
 * the model falls back to decomposing the domain name morphologically (e.g.
 * "genscore.es" -> "gen" -> generator manufacturers; "ifinanciera.es" ->
 * "financiera" -> consumer lenders). See
 * docs/adr/0020-grounded-business-profile.md.
 *
 * Reuses fetchPageSafely (lib/web-audit/fetch-page.ts) unmodified — a single
 * request to the project's own homepage is not a crawler (no link discovery,
 * no traversal) and inherits its existing SSRF hardening as-is.
 */

const MAX_EXCERPT_CHARS = 1500;
const MAX_HEADINGS = 6;
const MIN_USABLE_EXCERPT_CHARS = 40;

export type HomepageEvidence =
  | { status: "ok"; title: string; description: string; headings: string[]; excerpt: string }
  | { status: "unavailable" };

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/** Drops <script>/<style> block CONTENTS before stripping tags — a JSON-LD blob or CSS rule is not visible text. */
function stripToVisibleText(html: string): string {
  const withoutNonVisible = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  return stripTags(withoutNonVisible);
}

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripTags(match[1]) : "";
}

function extractMetaDescription(html: string): string {
  const match =
    html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i) ??
    html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["'][^>]*>/i);
  return match ? match[1].trim() : "";
}

function extractHeadings(html: string): string[] {
  const headings: string[] = [];
  for (const match of html.matchAll(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi)) {
    const text = stripTags(match[1]);
    if (text) headings.push(text);
    if (headings.length >= MAX_HEADINGS) break;
  }
  return headings;
}

/**
 * Fetches the project's own homepage and extracts the signals a business
 * profile can actually be inferred from — title, meta description,
 * H1/H2 headings, and a capped excerpt of visible text. Never throws: a
 * fetch failure, a non-HTML response, or a page with nothing usable (empty
 * shell / JS-only SPA render) all collapse to "unavailable", which the
 * caller must treat as "no evidence", never as an empty-but-valid profile.
 */
export async function fetchHomepageEvidence(domain: string): Promise<HomepageEvidence> {
  const result = await fetchPageSafely(`https://${domain}`, domain);
  if (result.status !== "analyzed") {
    return { status: "unavailable" };
  }

  const title = extractTitle(result.html);
  const description = extractMetaDescription(result.html);
  const headings = extractHeadings(result.html);
  const excerpt = stripToVisibleText(result.html).slice(0, MAX_EXCERPT_CHARS);

  if (!title && !description && headings.length === 0 && excerpt.length < MIN_USABLE_EXCERPT_CHARS) {
    return { status: "unavailable" };
  }

  return { status: "ok", title, description, headings, excerpt };
}

export type BusinessContextResult = { status: "identified"; profile: BusinessProfile } | { status: "unidentified" };

/**
 * Orchestrates evidence -> profile for the onboarding suggestion flow.
 * Returns "unidentified" (never a guessed profile) when there isn't enough
 * to go on: no fetched evidence and no user-provided description, a failed
 * Gemini call, or a profile Gemini itself flagged "low" confidence with
 * nothing to fall back on. Callers (suggestCompetitors/suggestPrompts call
 * sites) must skip suggestion entirely on "unidentified" rather than call
 * them with a placeholder profile — an honest "we couldn't figure out what
 * this business does" beats a confident wrong guess.
 */
export async function resolveBusinessContext(input: {
  domain: string;
  country: string;
  language: string;
  userDescription?: string;
}): Promise<BusinessContextResult> {
  const hasUserDescription = Boolean(input.userDescription?.trim());
  const evidence = await fetchHomepageEvidence(input.domain);

  if (evidence.status === "unavailable" && !hasUserDescription) {
    return { status: "unidentified" };
  }

  const profile = await inferBusinessProfile({
    domain: input.domain,
    country: input.country,
    language: input.language,
    evidence,
    userDescription: input.userDescription
  }).catch(() => null);

  if (!profile) return { status: "unidentified" };
  if (profile.confidence === "low" && !hasUserDescription) return { status: "unidentified" };

  return { status: "identified", profile };
}

/**
 * Derives the project's brand aliases from its own homepage evidence
 * (GEO-SCORE-BRAND-IDENTITY-1). Automatic, per the founder's decision
 * (2026-08-02): no manual step is required to get a correct measurement, and
 * a brand whose product carries the name — Mozilla/Firefox — is mis-measured
 * from its very first scan without one.
 *
 * Two-stage on purpose, mirroring how the rest of this pipeline treats model
 * output: `inferBrandAliases` PROPOSES from the fetched evidence, and
 * `selectVerifiableAliases` DISPOSES — dropping anything absent from that
 * same evidence, generic, too short, or over the cap. The model never gets to
 * write directly into something that moves the score.
 *
 * Returns [] on any failure or when the brand genuinely has no distinct
 * product name, which is the common and correct case. Never throws: alias
 * derivation is an enhancement to measurement, and failing it must never
 * block project creation or a scan.
 */
export async function deriveBrandAliases(input: { brand: string; domain: string }): Promise<string[]> {
  const evidence = await fetchHomepageEvidence(input.domain).catch(() => ({ status: "unavailable" }) as const);
  if (evidence.status !== "ok") return [];

  const proposed = await inferBrandAliases({
    brand: input.brand,
    domain: input.domain,
    evidence
  }).catch(() => [] as string[]);

  if (!proposed.length) return [];

  // The evidence the aliases are verified against is the same block the model
  // was shown — an alias it produced from memory rather than from the page
  // has nothing to match here and is dropped.
  const evidenceText = [evidence.title, evidence.description, ...evidence.headings, evidence.excerpt]
    .filter(Boolean)
    .join("\n");

  return selectVerifiableAliases(proposed, input.brand, evidenceText).accepted;
}
