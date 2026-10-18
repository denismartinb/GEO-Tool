import "server-only";

import { fitUnderCap, seoTrackingCapsFor } from "@/lib/seo-tracking/caps";
import { normalizeKeywordList } from "@/lib/seo-tracking/keyword-text";
import { planCompetitorChange } from "@/lib/seo-tracking/competitors";
import { isMissingTable } from "@/lib/seo-tracking/store";
import type { createServiceClient } from "@/lib/supabase/service";

/**
 * SEO-TRACK-1 (log §340): the writes behind «Posición en Google». Service
 * role, so the CALLER must have verified identity first
 * (`requireActiveProject(projectId)` + `requireUser().user.id`) and pass the
 * plan from the user's own plan read. These functions re-check that the
 * project belongs to that owner and filter every write by `project_id` AND
 * `owner_user_id` (`.claude/rules/seo-tracking.md`). The server actions that
 * call them land with the screen (PR B).
 */

type Service = ReturnType<typeof createServiceClient>;

export type KeywordSource = "search_console" | "competitor_gap" | "manual";

export type AddKeywordsResult =
  | { status: "ok"; added: string[]; duplicates: string[]; overCap: string[] }
  | { status: "unavailable" }
  | { status: "not_found" }
  | { status: "failed" };

async function ownedProjectDomain(service: Service, projectId: string, ownerUserId: string): Promise<string | null> {
  const { data } = await service
    .from("projects")
    .select("domain")
    .eq("id", projectId)
    .eq("owner_user_id", ownerUserId)
    .eq("is_archived", false)
    .maybeSingle();
  return (data?.domain as string | undefined) ?? null;
}

export async function addTrackedKeywordsCore(
  service: Service,
  input: { projectId: string; ownerUserId: string; planId: string | null | undefined; keywords: string[]; source: KeywordSource; topicId?: string | null }
): Promise<AddKeywordsResult> {
  if (!(await ownedProjectDomain(service, input.projectId, input.ownerUserId))) return { status: "not_found" };
  const wanted = normalizeKeywordList(input.keywords);

  const { data: existing, error } = await service
    .from("seo_keywords")
    .select("keyword, tracked")
    .eq("project_id", input.projectId)
    .eq("owner_user_id", input.ownerUserId);
  if (error) return isMissingTable(error) ? { status: "unavailable" } : { status: "failed" };

  if (input.topicId) {
    const { data: topic } = await service
      .from("seo_topics")
      .select("id")
      .eq("id", input.topicId)
      .eq("project_id", input.projectId)
      .eq("owner_user_id", input.ownerUserId)
      .maybeSingle();
    if (!topic) return { status: "not_found" };
  }

  const known = new Set((existing ?? []).map((row) => row.keyword as string));
  const duplicates = wanted.filter((keyword) => known.has(keyword));
  const fresh = wanted.filter((keyword) => !known.has(keyword));
  const trackedCount = (existing ?? []).filter((row) => row.tracked === true).length;
  const { accepted, rejected } = fitUnderCap(trackedCount, seoTrackingCapsFor(input.planId).keywords, fresh);

  if (accepted.length > 0) {
    const { error: insertError } = await service.from("seo_keywords").insert(
      accepted.map((keyword) => ({
        project_id: input.projectId,
        owner_user_id: input.ownerUserId,
        topic_id: input.topicId ?? null,
        keyword,
        source: input.source,
        tracked: true
      }))
    );
    if (insertError) return { status: "failed" };
  }
  return { status: "ok", added: accepted, duplicates, overCap: rejected };
}

export type SetCompetitorsResult =
  | { status: "ok"; kept: string[]; added: string[]; removed: string[]; rejected: string[] }
  | { status: "unavailable" }
  | { status: "not_found" }
  | { status: "failed" };

/**
 * Replaces the project's rival domains with `domains` (normalized, own domain
 * and duplicates dropped, cut to the plan's cap) and makes sure the `is_own`
 * row exists, so the backlink refresh also measures the project itself.
 */
export async function setCompetitorsCore(
  service: Service,
  input: { projectId: string; ownerUserId: string; planId: string | null | undefined; domains: string[] }
): Promise<SetCompetitorsResult> {
  const ownDomain = await ownedProjectDomain(service, input.projectId, input.ownerUserId);
  if (!ownDomain) return { status: "not_found" };

  const { data, error } = await service
    .from("seo_competitors")
    .select("id, domain, is_own")
    .eq("project_id", input.projectId)
    .eq("owner_user_id", input.ownerUserId);
  if (error) return isMissingTable(error) ? { status: "unavailable" } : { status: "failed" };

  const rows = (data ?? []) as Array<{ id: string; domain: string; is_own: boolean }>;
  const plan = planCompetitorChange({
    ownDomain,
    current: rows.filter((row) => !row.is_own).map((row) => row.domain),
    wanted: input.domains,
    cap: seoTrackingCapsFor(input.planId).competitors
  });

  if (plan.remove.length > 0) {
    const { error: deleteError } = await service
      .from("seo_competitors")
      .delete()
      .eq("project_id", input.projectId)
      .eq("owner_user_id", input.ownerUserId)
      .eq("is_own", false)
      .in("domain", plan.remove);
    if (deleteError) return { status: "failed" };
  }

  const inserts = plan.add.map((domain) => ({ project_id: input.projectId, owner_user_id: input.ownerUserId, domain, is_own: false }));
  if (!rows.some((row) => row.is_own)) inserts.push({ project_id: input.projectId, owner_user_id: input.ownerUserId, domain: plan.own, is_own: true });
  if (inserts.length > 0) {
    const { error: insertError } = await service.from("seo_competitors").insert(inserts);
    if (insertError) return { status: "failed" };
  }
  return { status: "ok", kept: plan.keep, added: plan.add, removed: plan.remove, rejected: plan.rejected };
}
