import "server-only";

import type { createServiceClient } from "@/lib/supabase/service";
import { getEffectiveGeoScore } from "@/lib/scoring/run-scoring";
import { sendWeeklyDigestEmail } from "@/lib/email/transactional";

const TIME_BUDGET_MS = 45_000;

type RunScoreRow = {
  run_id: string;
  visibility_score: number | null;
  details_json: unknown;
};

type RankingEntry = { name: string; is_brand: boolean; avg_position: number; mention_count: number };

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
 * Weekly digest per project (ALERTS-1 Fase 6b): GEO Score, its delta since
 * the previous scored run, the biggest competitor mention-count swing (if
 * available), and the top active recommendation. Only sent to a project
 * with at least 2 scored runs — with just 1, there is nothing real to
 * compare, and this digest is specifically about the week's evolution, not
 * a plain snapshot (that's what the Overview page is for).
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
      .select("run_id, visibility_score, details_json")
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
    const topMover = getTopCompetitorMover(currentRow, previousRow);

    const { data: topRecommendation } = await service
      .from("recommendations")
      .select("title, description")
      .eq("run_id", currentRow.run_id)
      .eq("status", "active")
      .order("priority_rank", { ascending: true })
      .limit(1)
      .maybeSingle();

    const email = emailByOwnerId.get(project.owner_user_id as string)!;
    await sendWeeklyDigestEmail(email, project.domain as string, {
      currentScore,
      previousScore,
      topMover,
      recommendation: topRecommendation ?? null
    });
    sent += 1;
  }

  return { processed: eligibleProjects.length, sent, skipped };
}
