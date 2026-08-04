import "server-only";

import type { createServiceClient } from "@/lib/supabase/service";
import { getEffectiveGeoScore } from "@/lib/scoring/run-scoring";
import { sendWeeklyDigestEmail } from "@/lib/email/transactional";

const TIME_BUDGET_MS = 45_000;
const SCANS_THIS_WEEK_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

type RunScoreRow = {
  run_id: string;
  visibility_score: number | null;
  citation_score: number | null;
  details_json: unknown;
};

type RankingEntry = {
  name: string;
  is_brand: boolean;
  /** null when the AI never named this entity (geo-score-v3, docs/adr/0026). */
  avg_position_when_mentioned: number | null;
  mention_count: number;
};

type SubScores = {
  /** presence — % of prompts where the brand was mentioned */
  visibility: number | null;
  /** authority — % of grounded prompts citing the brand's own domain */
  citation: number | null;
  /** standing — share of voice among brand + tracked competitor mentions */
  standing: number | null;
};

/**
 * Reads the already-computed sub-scores straight off the run row — no new
 * formulas, same fields the Overview page's geo_score breakdown uses
 * (lib/scoring/run-scoring.ts). null when a component was dropped for that
 * run (e.g. no grounded rows for authority) rather than fabricating a value.
 */
function getSubScores(row: RunScoreRow): SubScores {
  const details =
    row.details_json && typeof row.details_json === "object"
      ? (row.details_json as { geo_score?: { components?: Record<string, { value: number | null }> } })
      : {};
  const standing = details.geo_score?.components?.standing?.value ?? null;
  return {
    visibility: row.visibility_score,
    citation: row.citation_score,
    standing
  };
}

/**
 * Biggest competitor mention-count swing between two runs, by absolute
 * value — a real signal (same ranking data the Overview page already
 * shows per run, docs/adr/0005), not invented. Returns nothing if either
 * run lacks brand_position (e.g. pre-grounded-position-v1 runs) rather than
 * fabricating a comparison.
 */
function getTopCompetitorMover(
  currentRow: RunScoreRow,
  previousRow: RunScoreRow
): { name: string; mentionDelta: number } | null {
  const currentDetails = currentRow.details_json as { brand_position?: { ranking?: RankingEntry[] } } | null;
  const previousDetails = previousRow.details_json as { brand_position?: { ranking?: RankingEntry[] } } | null;
  const currentRanking = currentDetails?.brand_position?.ranking;
  const previousRanking = previousDetails?.brand_position?.ranking;
  if (!currentRanking || !previousRanking) return null;

  const previousByName = new Map(previousRanking.filter((e) => !e.is_brand).map((e) => [e.name, e]));

  let top: { name: string; mentionDelta: number } | null = null;
  for (const entry of currentRanking) {
    if (entry.is_brand) continue;
    const prev = previousByName.get(entry.name);
    if (!prev) continue;
    const mentionDelta = entry.mention_count - prev.mention_count;
    if (mentionDelta === 0) continue;
    if (!top || Math.abs(mentionDelta) > Math.abs(top.mentionDelta)) {
      top = { name: entry.name, mentionDelta };
    }
  }
  return top;
}

/**
 * Weekly digest per project (ALERTS-1 Fase 6b, expanded 2026-07-19 to
 * surface a real snapshot of every core-flow section — Overview,
 * Competitors, Recommendations, Escaneos — instead of just the score
 * delta). Only sent to a project with at least 2 scored runs — with just
 * 1, there is nothing real to compare, and this digest is specifically
 * about the week's evolution, not a plain snapshot (that's what the
 * Overview page is for). Every field is read from data already computed by
 * the scan pipeline or a plain count query — nothing here is invented.
 */
export async function runWeeklyDigest({
  service,
  maxProjects = Number(process.env.MAX_PROJECTS_PER_DIGEST_RUN ?? 200)
}: {
  service: ReturnType<typeof createServiceClient>;
  maxProjects?: number;
}): Promise<{ processed: number; sent: number; skipped: number }> {
  const startedAt = Date.now();

  const { data: candidateProjects, error: projectsError } = await service
    .from("projects")
    .select("id, domain, owner_user_id")
    .eq("is_archived", false);

  if (projectsError) {
    console.error("[geo:alerts:weekly-digest] failed to load candidate projects", { message: projectsError.message });
    throw new Error("query_failed");
  }

  const ownerIds = Array.from(new Set((candidateProjects ?? []).map((p) => p.owner_user_id as string)));
  const { data: profileRows } = ownerIds.length
    ? await service.from("profiles").select("id, email, notify_weekly_digest").in("id", ownerIds)
    : { data: [] as Array<{ id: string; email: string | null; notify_weekly_digest: boolean }> };

  const emailByOwnerId = new Map(
    (profileRows ?? [])
      .filter((row) => row.notify_weekly_digest !== false && row.email)
      .map((row) => [row.id as string, row.email as string])
  );

  const eligibleProjects = (candidateProjects ?? [])
    .filter((p) => emailByOwnerId.has(p.owner_user_id as string))
    .slice(0, maxProjects);

  let sent = 0;
  let skipped = 0;

  for (const project of eligibleProjects) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      skipped += eligibleProjects.length - sent - skipped;
      break;
    }

    const { data: recentScores } = await service
      .from("run_scores")
      .select("run_id, visibility_score, citation_score, details_json")
      .eq("project_id", project.id)
      .order("created_at", { ascending: false })
      .limit(2);

    if (!recentScores || recentScores.length < 2) {
      skipped += 1;
      continue;
    }

    const [currentRow, previousRow] = recentScores as RunScoreRow[];
    const currentScore = getEffectiveGeoScore(currentRow);
    const previousScore = getEffectiveGeoScore(previousRow);
    // No score means the run read nothing, not that the brand scored zero
    // (geo-score-v4, docs/adr/0027). A digest is a weekly summary, not a place
    // to invent a number for a scan that failed.
    if (currentScore === null || previousScore === null) {
      skipped += 1;
      continue;
    }
    const subScores = getSubScores(currentRow);
    const topMover = getTopCompetitorMover(currentRow, previousRow);

    const scansSinceIso = new Date(Date.now() - SCANS_THIS_WEEK_WINDOW_MS).toISOString();

    const [{ data: topRecommendation }, { count: activeRecommendationsCount }, { count: promptsCount }, { count: competitorsCount }, { count: scansThisWeek }] =
      await Promise.all([
        service
          .from("recommendations")
          .select("title, description")
          .eq("run_id", currentRow.run_id)
          .eq("status", "active")
          .order("priority_rank", { ascending: true })
          .limit(1)
          .maybeSingle(),
        service
          .from("recommendations")
          .select("id", { count: "exact", head: true })
          .eq("run_id", currentRow.run_id)
          .eq("status", "active"),
        service.from("project_prompts").select("id", { count: "exact", head: true }).eq("project_id", project.id).eq("is_active", true),
        service
          .from("project_competitors")
          .select("id", { count: "exact", head: true })
          .eq("project_id", project.id)
          .eq("is_active", true),
        service
          .from("scan_runs")
          .select("id", { count: "exact", head: true })
          .eq("project_id", project.id)
          .eq("status", "completed")
          .gte("created_at", scansSinceIso)
      ]);

    const email = emailByOwnerId.get(project.owner_user_id as string)!;
    await sendWeeklyDigestEmail(email, project.domain as string, {
      currentScore,
      previousScore,
      subScores,
      topMover,
      recommendation: topRecommendation ?? null,
      activeRecommendationsCount: activeRecommendationsCount ?? 0,
      promptsCount: promptsCount ?? 0,
      competitorsCount: competitorsCount ?? 0,
      scansThisWeek: scansThisWeek ?? 0
    });
    sent += 1;
  }

  return { processed: eligibleProjects.length, sent, skipped };
}
