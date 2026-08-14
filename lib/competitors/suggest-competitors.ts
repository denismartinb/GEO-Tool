import "server-only";

import { z } from "zod";
import { normalizeDomain } from "@/lib/domains/brand-domain";
import type { SuggestedCompetitor } from "@/lib/llm/gemini";
import type { BusinessProfile } from "@/lib/llm/contracts";
import { resolveAndCacheBusinessProfile } from "@/lib/projects/business-profile";
import type { AuthenticatedContext } from "@/lib/auth";

/**
 * COMPETITOR-SUGGESTIONS-1 — "Competidores sugeridos" on the Competitors page.
 *
 * Replaces the old "Marcas que aparecen y no sigues" block, which derived
 * suggestions from `other_brands_mentioned` (whatever brand names happened to
 * show up in a scan's answers). That answered the wrong question: for a
 * browser project it surfaced AliExpress/Carrefour/eBay purely because a
 * grounded answer cited an unrelated shopping page. The founder's call
 * (2026-08-03): suggestions must be computed from what the brand REALLY is,
 * not from what the prompts happen to say.
 *
 * So this reuses the exact onboarding mechanism: the project's cached
 * `business_profile` (docs/adr/0022) feeds `suggestCompetitors`
 * (lib/llm/gemini.ts), a Google-Search-grounded lookup for real, comparable
 * rivals in the same sector, sub-sector, business model and geography.
 *
 * Because that call is slow and costs a Gemini request, the raw result is
 * cached on `projects.suggested_competitors` (migration 0023). The cache
 * stores the list UNFILTERED — already-tracked competitors are removed on
 * every read instead of at write time, so following a suggestion drops it
 * from the list with no cache invalidation, and un-following brings it back.
 *
 * Both external dependencies are injected so the whole decision tree stays
 * unit-testable without stubbing the LLM module or hitting the network.
 */

export const suggestedCompetitorsInputSchema = z.object({
  projectId: z.string().uuid(),
  /** Forces a fresh grounded lookup, ignoring (and overwriting) the cache. */
  refresh: z.boolean().optional()
});

export type SuggestedCompetitorsResult =
  | { success: true; suggestions: SuggestedCompetitor[]; cached: boolean }
  | { success: false; error: string };

/** How many suggestions the grounded lookup is asked for. */
const SUGGESTION_LIMIT = 6;

const PROJECT_NOT_FOUND = "No se ha encontrado el proyecto.";
const LOOKUP_FAILED =
  "No se han podido cargar los competidores sugeridos en este momento. Inténtalo de nuevo en unos minutos.";
const PROFILE_UNRESOLVED =
  "Todavía no hemos podido identificar a qué se dedica esta marca, así que no podemos sugerir competidores fiables. Inténtalo de nuevo en unos minutos.";
const SUGGESTION_FAILED =
  "No se han podido calcular competidores sugeridos en este momento. Inténtalo de nuevo en unos minutos.";

const DOMAIN_FORMAT = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

const cachedSuggestionsSchema = z.object({
  computedAt: z.string(),
  items: z
    .array(z.object({ name: z.string(), domain: z.string() }))
    .default([])
});

/**
 * Defensively parses `projects.suggested_competitors` (jsonb) — never throws,
 * returns null on anything malformed or absent, exactly like
 * `parsePersistedBusinessProfile` does for the profile column.
 */
export function parseCachedSuggestions(raw: unknown): SuggestedCompetitor[] | null {
  if (!raw || typeof raw !== "object") return null;
  const parsed = cachedSuggestionsSchema.safeParse(raw);
  return parsed.success ? parsed.data.items : null;
}

function normName(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Drops anything that must never be offered as a suggestion: malformed rows,
 * the project's own domain, and every competitor already on the project —
 * active OR inactive, because a rival the user deliberately deactivated
 * should not come back as a fresh "suggestion".
 */
export function filterSuggestions(input: {
  items: SuggestedCompetitor[];
  projectDomain: string;
  trackedDomains: string[];
  trackedNames: string[];
}): SuggestedCompetitor[] {
  const ownDomain = normalizeDomain(input.projectDomain);
  const blockedDomains = new Set([ownDomain, ...input.trackedDomains.map(normalizeDomain)].filter(Boolean));
  const blockedNames = new Set(input.trackedNames.map(normName).filter(Boolean));
  const seen = new Set<string>();
  const out: SuggestedCompetitor[] = [];

  for (const item of input.items) {
    const name = typeof item?.name === "string" ? item.name.trim() : "";
    const domain = typeof item?.domain === "string" ? normalizeDomain(item.domain) : "";
    if (!name || !domain) continue;
    if (!DOMAIN_FORMAT.test(domain) || domain.length < 3 || domain.length > 255) continue;
    if (blockedDomains.has(domain) || blockedNames.has(normName(name))) continue;
    if (seen.has(domain)) continue;
    seen.add(domain);
    out.push({ name, domain });
  }

  return out;
}

type ProjectRow = {
  brand: string;
  domain: string;
  country: string;
  language: string;
  business_profile: unknown;
  suggested_competitors: unknown;
};

export async function getSuggestedCompetitorsCore(input: {
  projectId: string;
  refresh: boolean;
  supabase: AuthenticatedContext["supabase"];
  user: AuthenticatedContext["user"];
  suggest: (args: {
    brand: string;
    domain: string;
    country: string;
    language: string;
    profile: BusinessProfile;
    limit: number;
  }) => Promise<SuggestedCompetitor[]>;
}): Promise<SuggestedCompetitorsResult> {
  const { projectId, refresh, supabase, user, suggest } = input;

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("brand, domain, country, language, business_profile, suggested_competitors")
    .eq("id", projectId)
    .eq("owner_user_id", user.id)
    .eq("is_archived", false)
    .maybeSingle();

  // A failed query and a genuinely missing project are different problems and
  // must not share a message: reporting "no se ha encontrado el proyecto" for
  // what is actually a DB-level failure (an unapplied migration, a transient
  // error) sends whoever reads it chasing the wrong thing. Caught for real —
  // the pilot surfaced exactly that on a preview where 0023 had not been
  // applied yet.
  if (projectError) {
    console.warn("[suggest-competitors] project lookup failed", {
      project_id: projectId,
      message: projectError.message
    });
    return { success: false, error: LOOKUP_FAILED };
  }

  if (!project) {
    return { success: false, error: PROJECT_NOT_FOUND };
  }

  const row = project as ProjectRow;

  // Every competitor on the project, active and inactive alike — see
  // filterSuggestions for why inactive ones count as blocked too.
  const { data: tracked } = await supabase
    .from("project_competitors")
    .select("name, domain")
    .eq("project_id", projectId);

  const trackedRows = (tracked ?? []) as Array<{ name: string | null; domain: string | null }>;
  const trackedDomains = trackedRows.map((c) => c.domain ?? "").filter(Boolean);
  const trackedNames = trackedRows.map((c) => c.name ?? "").filter(Boolean);

  const applyFilter = (items: SuggestedCompetitor[]) =>
    filterSuggestions({ items, projectDomain: row.domain, trackedDomains, trackedNames });

  if (!refresh) {
    const cached = parseCachedSuggestions(row.suggested_competitors);
    if (cached) {
      return { success: true, suggestions: applyFilter(cached), cached: true };
    }
  }

  const profile = await resolveAndCacheBusinessProfile({
    projectId,
    ownerUserId: user.id,
    domain: row.domain,
    country: row.country,
    language: row.language,
    existingProfile: row.business_profile,
    supabase,
    logLabel: "suggest-competitors"
  });

  // No profile means we genuinely do not know what this business does. Say so
  // rather than falling back to a domain-string guess — that blind mode is
  // exactly what docs/adr/0020 removed for producing nonsense competitors.
  if (!profile) {
    return { success: false, error: PROFILE_UNRESOLVED };
  }

  let items: SuggestedCompetitor[];
  try {
    items = await suggest({
      brand: row.brand,
      domain: row.domain,
      country: row.country,
      language: row.language,
      profile,
      limit: SUGGESTION_LIMIT
    });
  } catch {
    // .claude/rules/server-actions.md: a provider failure is a sanitized
    // message, never a raw exception surfacing in the UI.
    return { success: false, error: SUGGESTION_FAILED };
  }

  // Best-effort cache write: the suggestions in hand are already valid, so a
  // failed write must not fail the request — the next call just recomputes.
  const { error: cacheError } = await supabase
    .from("projects")
    .update({
      suggested_competitors: { computedAt: new Date().toISOString(), items }
    })
    .eq("id", projectId)
    .eq("owner_user_id", user.id);

  if (cacheError) {
    console.warn("[suggest-competitors] cache write failed", {
      project_id: projectId,
      message: cacheError.message
    });
  }

  return { success: true, suggestions: applyFilter(items), cached: false };
}
