import "server-only";
import { z } from "zod";
import { fetchPageSafely } from "@/lib/web-audit/fetch-page";
import { inferBusinessProfile, type BusinessProfile } from "@/lib/llm/gemini";

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

const persistedBusinessProfileSchema = z.object({
  whatItSells: z.string(),
  sector: z.string(),
  subSector: z.string(),
  businessModel: z.enum(["b2b", "b2c", "both", "unknown"]),
  targetCustomer: z.string(),
  geographicScope: z.string(),
  sizeEstimate: z.string(),
  confidence: z.enum(["low", "medium", "high"])
});

/**
 * Defensively parses `projects.business_profile` (jsonb) — never throws,
 * returns null on anything malformed/absent. Shared by every reader of the
 * cached profile (prompt suggestion, and — EMERGING-BRANDS-GROUNDING-1 —
 * scan extraction), so the persisted shape only has one source of truth.
 */
export function parsePersistedBusinessProfile(raw: unknown): BusinessProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const parsed = persistedBusinessProfileSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
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
