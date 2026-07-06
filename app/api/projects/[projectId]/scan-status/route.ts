import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({ projectId: z.string().uuid() });

/**
 * Lightweight polling endpoint for scan progress (docs/architecture-audit-2026-07.md,
 * PERF-3b). Returns just the project's latest scan_runs row — id, status, and
 * prompt counters — instead of the client polling via `router.refresh()`,
 * which re-rendered the whole layout + page (including the unbounded
 * `getWorkspaceCounters` query) every 4s while a scan was active.
 *
 * RLS-scoped via the user's own client (same trust model as every other
 * `.eq("project_id", ...)` read in this codebase) — no service-role shortcut.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_project_id" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: run } = await supabase
    .from("scan_runs")
    .select("id, status, total_prompts, successful_prompts, failed_prompts")
    .eq("project_id", parsed.data.projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({ run: run ?? null });
}
