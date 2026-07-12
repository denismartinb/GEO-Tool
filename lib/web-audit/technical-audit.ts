import "server-only";

import { z } from "zod";
import { isProOrAbove } from "@/lib/billing";
import { feedbackErrorMessages } from "@/lib/projects/feedback-messages";
import { type createServiceClient } from "@/lib/supabase/service";
import { type AuthenticatedContext } from "@/lib/scan/types";
import { resolveGroundingRedirects } from "@/lib/scan/citation-resolution";
import { checkSnapshotRateLimit, DEFAULT_SNAPSHOT_RATE_LIMIT } from "@/lib/web-audit/snapshot-rate-limit";
import { parseCoverageMap } from "@/lib/web-audit/coverage-map";
import { fetchPageSafely, isAllowedAuditHost, type PageFetchStatus } from "@/lib/web-audit/fetch-page";
import { buildPageCheckResult, type PageCheckResult } from "@/lib/web-audit/page-checks";
import { buildBotAccessReport, type BotAccessReport } from "@/lib/web-audit/robots";

/**
 * "Auditar salud técnica GEO" (WEB-AUDIT-2): a Pro+-gated, deterministic
 * (no-LLM) technical audit of up to MAX_AUDIT_PAGES own-domain pages the
 * product already knows about, plus AI-bot access (robots.txt / llms.txt).
 * Lives on the "Auditoría web" page, sibling to domain-coverage.ts's
 * "Auditar cobertura del dominio", and mirrors its core invariants:
 *
 * 1. Ownership proven with the user-context (RLS-scoped) client before any
 *    service-role write.
 * 2. Pro-plan gate reads `profiles.current_plan` directly via isProOrAbove.
 * 3. Cache check runs BEFORE the rate-limit check (data-guardian R4): a cache
 *    hit returns immediately, so repeated legitimate cache hits never
 *    consume rate-limit budget.
 * 4. Persist unconditionally: every consumed run leaves a row (including a
 *    run where every page was skipped), so the rate limit reflects real
 *    spend.
 *
 * Explicitly NOT a crawler (docs/specs/web-audit/phase-2-technical-audit.md):
 * candidate URLs come ONLY from data already persisted by the product — see
 * `selectCandidateUrls`. Zero link-following, zero sitemap parsing, zero URL
 * discovery of any kind. Every candidate is re-verified fail-closed by
 * `fetchPageSafely` (SSRF-hardened: DNS-resolved IP check, manual redirect
 * handling) immediately before it is fetched.
 */

export const technicalAuditInputSchema = z.object({
  projectId: z.string().uuid()
});

export type CandidateSource = "homepage" | "coverage_page" | "grounding_citation";

export type PageCandidate = {
  url: string;
  source: CandidateSource;
  contextLabel: string;
};

export type PageAuditEntry = {
  url: string;
  contextLabel: string;
  status: PageFetchStatus | "skipped_budget";
  check: PageCheckResult | null;
  /** WEB-AUDIT-R3: informational fetch metadata, never fed into pageScore — see fetch-page.ts's PageFetchResult. Null for any non-"analyzed" status. */
  fetchMs: number | null;
  htmlBytes: number | null;
};

export type TechnicalAuditSnapshot = {
  scanId: string | null;
  generatedAt: string;
  readinessScore: number | null;
  pages: PageAuditEntry[];
  bots: BotAccessReport;
};

export type TechnicalAuditResult =
  | { success: true; snapshot: TechnicalAuditSnapshot; cached: boolean }
  | { success: false; error: string };

const GENERIC_FAILURE = "No se ha podido auditar la salud técnica de tu web en este momento. Inténtalo de nuevo en unos minutos.";
const PLAN_REQUIRED_FAILURE = "Auditar la salud técnica de tu web está disponible a partir del plan Pro.";
const RATE_LIMIT_FAILURE =
  "Has alcanzado el límite de auditorías técnicas para este proyecto por hoy. Vuelve a intentarlo más tarde.";
const NO_SCAN_FAILURE = "Necesitas al menos un escaneo completado antes de auditar la salud técnica de tu web.";

const LOG_PREFIX = "[geo:technical-audit]";

export const MAX_AUDIT_PAGES = 10;
export const TECH_AUDIT_TOTAL_BUDGET_MS = 25_000;
const CACHE_FRESH_MS = 24 * 60 * 60 * 1000;

const SUPABASE_CALL_TIMEOUT_MS = 8_000;

class OperationTimeoutError extends Error {
  constructor(stage: string) {
    super(`Operation timed out: ${stage}`);
    this.name = "OperationTimeoutError";
  }
}

function withTimeout<T>(promise: PromiseLike<T>, stage: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new OperationTimeoutError(stage)), SUPABASE_CALL_TIMEOUT_MS);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function normalizeDomain(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

function sanitizeField(input: string, maxLen: number): string {
  let stripped = "";
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0;
    stripped += code < 0x20 || code === 0x7f ? " " : ch;
  }
  return stripped
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

/** Strips hash and query so `/pricing`, `/pricing?utm=x`, and `/pricing#top` dedupe to one candidate. */
function stripUrlForDedupe(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    url.hash = "";
    url.search = "";
    return url.toString();
  } catch {
    return rawUrl;
  }
}

/**
 * Pure candidate selection (spec's "explicitly not a crawler" boundary): the
 * homepage, verified coverage-map pages, and own-domain resolved grounding
 * citations — nothing else. Dedupes by URL-without-hash/query, keeps the
 * given priority order, caps at `maxPages`, and drops anything whose host
 * isn't the project's own domain or a label-boundary subdomain (defense in
 * depth — `fetchPageSafely` re-verifies every candidate again, including
 * DNS resolution, before it is ever fetched).
 */
export function selectCandidateUrls(input: {
  homepageUrl: string;
  coveragePages: Array<{ url: string; topic: string }>;
  groundingCitationUrls: Array<{ url: string; promptCount: number }>;
  projectDomainNormalized: string;
  maxPages?: number;
}): PageCandidate[] {
  const maxPages = input.maxPages ?? MAX_AUDIT_PAGES;
  const candidates: PageCandidate[] = [
    { url: input.homepageUrl, source: "homepage", contextLabel: "portada" },
    ...input.coveragePages.map((p) => ({
      url: p.url,
      source: "coverage_page" as const,
      contextLabel: "verificada"
    })),
    ...input.groundingCitationUrls.map((c) => ({
      url: c.url,
      source: "grounding_citation" as const,
      contextLabel: `citada en ${c.promptCount} ${c.promptCount === 1 ? "prompt" : "prompts"}`
    }))
  ];

  const seen = new Set<string>();
  const selected: PageCandidate[] = [];
  for (const candidate of candidates) {
    let parsed: URL;
    try {
      parsed = new URL(candidate.url);
    } catch {
      continue;
    }
    if (parsed.protocol !== "https:") continue;
    if (!isAllowedAuditHost(parsed.hostname, input.projectDomainNormalized)) continue;

    const dedupeKey = stripUrlForDedupe(candidate.url);
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    selected.push(candidate);
    if (selected.length >= maxPages) break;
  }
  return selected;
}

type ProjectRow = { id: string; domain: string; is_archived: boolean };
type CitationEntry = { url: string | null; domain: string | null; source: string };

/**
 * Groups the latest completed scan's own-domain grounding citations by their
 * (unresolved) Google redirect URI, counting how many distinct prompts cited
 * each — used for the "citada en N prompts" context label. Only
 * `source: "grounding"` citations count (invariant mirrored from
 * domain-coverage.ts / extraction.ts: an "inline" citation is a heuristic
 * text mention, not a verified grounding source).
 */
function collectOwnDomainGroundingUris(
  resultRows: Array<{ prompt_id: string | null; extracted_json: unknown }>,
  projectDomainNormalized: string
): Map<string, { promptIds: Set<string> }> {
  const byUri = new Map<string, { promptIds: Set<string> }>();
  for (const row of resultRows) {
    const extracted = row.extracted_json as { citations?: CitationEntry[] } | null;
    const citations = Array.isArray(extracted?.citations) ? extracted!.citations : [];
    for (const citation of citations) {
      if (citation.source !== "grounding" || !citation.url || !citation.domain) continue;
      if (!isAllowedAuditHost(citation.domain.toLowerCase(), projectDomainNormalized)) continue;
      const entry = byUri.get(citation.url) ?? { promptIds: new Set<string>() };
      if (row.prompt_id) entry.promptIds.add(row.prompt_id);
      byUri.set(citation.url, entry);
    }
  }
  return byUri;
}

/**
 * Resolves grounding-citation redirect URIs (already domain-filtered by
 * `citation.domain`) to their real destination URL, reusing
 * `resolveGroundingRedirects` — the same helper domain-coverage.ts already
 * uses for the same purpose. Fail-closed: an unresolved redirect is dropped,
 * never guessed at. The resolved URL is filtered against
 * `projectDomainNormalized` again (defense in depth), since the persisted
 * `citation.domain` and a freshly-resolved URL could in principle diverge if
 * the redirect target has since changed.
 */
async function resolveOwnDomainGroundingUrls(
  byUri: Map<string, { promptIds: Set<string> }>,
  projectDomainNormalized: string
): Promise<Array<{ url: string; promptCount: number }>> {
  if (byUri.size === 0) return [];
  const resolvedByUri = await resolveGroundingRedirects([...byUri.keys()]);
  const results: Array<{ url: string; promptCount: number }> = [];
  for (const [uri, entry] of byUri) {
    const resolvedUrl = resolvedByUri.get(uri)?.resolvedUrl;
    if (!resolvedUrl) continue;
    let hostname: string;
    try {
      hostname = new URL(resolvedUrl).hostname.toLowerCase();
    } catch {
      continue;
    }
    if (!isAllowedAuditHost(hostname, projectDomainNormalized)) continue;
    results.push({ url: resolvedUrl, promptCount: entry.promptIds.size });
  }
  return results;
}

function computeReadinessScore(pages: PageAuditEntry[]): number | null {
  const scored = pages.filter((p): p is PageAuditEntry & { check: PageCheckResult } => p.status === "analyzed" && p.check !== null);
  if (scored.length === 0) return null;
  const sum = scored.reduce((acc, p) => acc + p.check.pageScore, 0);
  return Math.round(sum / scored.length);
}

export async function runTechnicalAuditCore({
  projectId,
  supabase,
  service,
  user
}: {
  projectId: string;
  supabase: AuthenticatedContext["supabase"];
  service: ReturnType<typeof createServiceClient>;
  user: AuthenticatedContext["user"];
}): Promise<TechnicalAuditResult> {
  try {
    const { data: projectRaw, error: projectError } = await withTimeout(
      supabase.from("projects").select("id, domain, is_archived").eq("id", projectId).eq("owner_user_id", user.id).maybeSingle(),
      "load_project"
    );
    const project = projectRaw as unknown as ProjectRow | null;
    if (projectError || !project) {
      return { success: false, error: feedbackErrorMessages.project_not_found };
    }
    if (project.is_archived) {
      return { success: false, error: feedbackErrorMessages.project_archived };
    }

    const { data: profileRaw } = await withTimeout(
      supabase.from("profiles").select("current_plan").eq("id", user.id).maybeSingle(),
      "load_plan"
    );
    if (!isProOrAbove((profileRaw as { current_plan?: string } | null)?.current_plan)) {
      return { success: false, error: PLAN_REQUIRED_FAILURE };
    }

    const { data: latestRunRaw } = await withTimeout(
      supabase
        .from("scan_runs")
        .select("id")
        .eq("project_id", projectId)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      "load_latest_run"
    );
    const scanId = (latestRunRaw as { id: string } | null)?.id ?? null;
    if (!scanId) {
      return { success: false, error: NO_SCAN_FAILURE };
    }

    // Cache check BEFORE the rate-limit check (data-guardian R4): a fresh
    // (<24h) snapshot for the CURRENT latest completed run is served without
    // consuming any budget.
    const { data: latestSnapshotRaw } = await withTimeout(
      service
        .from("web_audit_snapshots")
        .select("scan_id, readiness_score, pages, bots, created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      "load_latest_snapshot"
    );
    const latestSnapshot = latestSnapshotRaw as {
      scan_id: string | null;
      readiness_score: number | null;
      pages: PageAuditEntry[];
      bots: BotAccessReport;
      created_at: string;
    } | null;
    if (latestSnapshot && latestSnapshot.scan_id === scanId) {
      const ageMs = Date.now() - new Date(latestSnapshot.created_at).getTime();
      if (ageMs < CACHE_FRESH_MS) {
        return {
          success: true,
          cached: true,
          snapshot: {
            scanId: latestSnapshot.scan_id,
            generatedAt: latestSnapshot.created_at,
            readinessScore: latestSnapshot.readiness_score,
            pages: latestSnapshot.pages,
            bots: latestSnapshot.bots
          }
        };
      }
    }

    const rateLimit = await checkSnapshotRateLimit(service, projectId, { config: DEFAULT_SNAPSHOT_RATE_LIMIT });
    if (!rateLimit.allowed) {
      console.warn(`${LOG_PREFIX} rate_limited`, { project_id: projectId });
      return {
        success: false,
        error: rateLimit.reason === "rate_limit_exceeded" ? RATE_LIMIT_FAILURE : GENERIC_FAILURE
      };
    }

    const { data: projectDomainRaw } = await withTimeout(
      supabase.from("projects").select("domain").eq("id", projectId).maybeSingle(),
      "load_domain"
    );
    const domain = (projectDomainRaw as { domain: string } | null)?.domain ?? project.domain;
    const projectDomainNormalized = normalizeDomain(domain);
    const homepageUrl = `https://${projectDomainNormalized}/`;

    // Coverage-map candidate source: verified pages from the latest
    // completed domain-coverage campaign, if any (best-effort — a project
    // that has never run "Auditar cobertura" simply contributes zero
    // candidates from this source).
    const { data: coverageRow } = await withTimeout(
      service
        .from("generated_solutions")
        .select("sanitized_content")
        .eq("project_id", projectId)
        .eq("generation_type", "domain_coverage")
        .is("recommendation_id", null)
        .eq("status", "completed")
        .eq("is_sanitized", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      "load_coverage_map"
    );
    const coverageMap = parseCoverageMap((coverageRow as { sanitized_content: string | null } | null)?.sanitized_content ?? null);
    const coveragePages = (coverageMap?.topics ?? []).flatMap((t) => t.pages.map((p) => ({ url: p.url, topic: t.topic })));

    // Grounding-citation candidate source: own-domain citations from the
    // current latest completed scan's persisted results.
    const { data: resultRows } = await withTimeout(
      supabase
        .from("scan_prompt_results")
        .select("prompt_id, extracted_json")
        .eq("project_id", projectId)
        .eq("run_id", scanId)
        .eq("status", "completed"),
      "load_scan_results"
    );
    const groundingUrisByUri = collectOwnDomainGroundingUris(
      (resultRows ?? []) as Array<{ prompt_id: string | null; extracted_json: unknown }>,
      projectDomainNormalized
    );
    const groundingCitationUrls = await resolveOwnDomainGroundingUrls(groundingUrisByUri, projectDomainNormalized);

    const candidates = selectCandidateUrls({
      homepageUrl,
      coveragePages,
      groundingCitationUrls,
      projectDomainNormalized
    });

    const pages: PageAuditEntry[] = [];
    const startedAt = Date.now();
    for (const candidate of candidates) {
      if (Date.now() - startedAt > TECH_AUDIT_TOTAL_BUDGET_MS) {
        pages.push({ url: candidate.url, contextLabel: candidate.contextLabel, status: "skipped_budget", check: null, fetchMs: null, htmlBytes: null });
        continue;
      }
      const fetchResult = await fetchPageSafely(candidate.url, projectDomainNormalized);
      if (fetchResult.status === "analyzed") {
        pages.push({
          url: candidate.url,
          contextLabel: candidate.contextLabel,
          status: "analyzed",
          check: buildPageCheckResult(fetchResult.html, { pageUrl: fetchResult.finalUrl, projectDomainNormalized }),
          fetchMs: fetchResult.fetchMs ?? null,
          htmlBytes: fetchResult.htmlBytes ?? null
        });
      } else {
        pages.push({ url: candidate.url, contextLabel: candidate.contextLabel, status: fetchResult.status, check: null, fetchMs: null, htmlBytes: null });
      }
    }

    const bots = await buildBotAccessReport(projectDomainNormalized);
    const readinessScore = computeReadinessScore(pages);
    const generatedAt = new Date().toISOString();

    const sanitizedPages = pages.map((p) => ({
      ...p,
      url: sanitizeField(p.url, 2000),
      contextLabel: sanitizeField(p.contextLabel, 120)
    }));

    // Persist unconditionally (invariant 4): every consumed rate-limit unit
    // leaves a row, even a run where every candidate was skipped.
    const { error: persistError } = await withTimeout(
      service.from("web_audit_snapshots").insert({
        project_id: projectId,
        scan_id: scanId,
        source: "manual",
        readiness_score: readinessScore,
        pages: sanitizedPages,
        bots
      }),
      "persist_snapshot"
    );
    if (persistError) {
      console.error(`${LOG_PREFIX} persist_failed`, { project_id: projectId });
      return { success: false, error: GENERIC_FAILURE };
    }

    console.info(`${LOG_PREFIX} completed`, {
      project_id: projectId,
      scan_id: scanId,
      pages_count: pages.length,
      analyzed: pages.filter((p) => p.status === "analyzed").length,
      readiness_score: readinessScore
    });

    return {
      success: true,
      cached: false,
      snapshot: { scanId, generatedAt, readinessScore, pages: sanitizedPages, bots }
    };
  } catch (error) {
    if (error instanceof OperationTimeoutError) {
      console.error(`${LOG_PREFIX} stage_timed_out`, { project_id: projectId, stage: error.message });
    } else {
      console.error(`${LOG_PREFIX} unexpected_error`, {
        project_id: projectId,
        error_name: error instanceof Error ? error.name : "unknown"
      });
    }
    return { success: false, error: GENERIC_FAILURE };
  }
}
