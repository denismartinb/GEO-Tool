import "server-only";

import { requireUser } from "@/lib/auth";

const PROMPT_CAP = 100;
const PROJECT_CAP = 5;
const ENGINE_CAP = 4;

export type UsageSummary = {
  promptCount: number;
  promptCap: number;
  projectCount: number;
  projectCap: number;
  engineCount: number;
  engineCap: number;
};

/**
 * Real usage counters for the "Plan y facturación" page. Mirrors the
 * RLS-scoped, no-explicit-owner-filter query style used by
 * getWorkspaceCounters(): every query below relies on RLS to limit rows to
 * the current user's own projects.
 */
export async function getUsageSummary(): Promise<UsageSummary> {
  const { supabase } = await requireUser();

  const [{ data: projects }, { data: prompts }, { data: results }] = await Promise.all([
    supabase.from("projects").select("id").eq("is_archived", false),
    supabase.from("project_prompts").select("id").eq("is_active", true),
    supabase
      .from("scan_prompt_results")
      .select("provider")
      .order("created_at", { ascending: false })
      .limit(500)
  ]);

  const engineSet = new Set((results ?? []).map((r) => r.provider).filter(Boolean));

  return {
    promptCount: prompts?.length ?? 0,
    promptCap: PROMPT_CAP,
    projectCount: projects?.length ?? 0,
    projectCap: PROJECT_CAP,
    engineCount: engineSet.size,
    engineCap: ENGINE_CAP
  };
}
