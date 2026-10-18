import "server-only";

import type { AuthenticatedContext } from "@/lib/auth";
import {
  buildPurchaseQuestions,
  type PurchaseAnswer,
  type PurchaseCitation,
  type PurchaseQuestionsReport
} from "@/lib/agentic-audit/purchase-questions";

type ResultRow = {
  prompt_id: string | null;
  prompt_text_snapshot: string;
  provider: string | null;
  raw_response_text: string | null;
  extracted_json: { brand?: { mentioned?: boolean }; citations?: PurchaseCitation[] } | null;
  extraction_error: string | null;
};

export type PurchaseQuestionsLoad =
  | { state: "no_scan" }
  | { state: "ready"; report: PurchaseQuestionsReport; scannedAt: string };

/**
 * «Preguntas de compra» (log §330) of the project's latest completed scan,
 * read with the user's own client (RLS). One scan, so the per-question table
 * and the three figures always describe the same answers.
 */
export async function loadPurchaseQuestions(
  supabase: AuthenticatedContext["supabase"],
  project: { id: string; domain: string }
): Promise<PurchaseQuestionsLoad> {
  const { data: run } = await supabase
    .from("scan_runs")
    .select("id, finished_at, created_at")
    .eq("project_id", project.id)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!run) return { state: "no_scan" };

  const [{ data: resultRows }, { data: promptRows }] = await Promise.all([
    supabase
      .from("scan_prompt_results")
      .select("prompt_id, prompt_text_snapshot, provider, raw_response_text, extracted_json, extraction_error")
      .eq("project_id", project.id)
      .eq("run_id", run.id),
    supabase.from("project_prompts").select("id, category").eq("project_id", project.id)
  ]);

  const topicByPrompt = new Map(
    ((promptRows ?? []) as Array<{ id: string; category: string | null }>).map((p) => [p.id, p.category])
  );
  const rows = (resultRows ?? []) as ResultRow[];
  // An answer nothing could extract carries no verdict: counting it as «not
  // named» would invent a miss (scan rules, "no mute rows").
  const answers: PurchaseAnswer[] = rows
    .filter((r) => r.prompt_id && r.extracted_json && !r.extraction_error)
    .map((r) => ({
      promptId: r.prompt_id as string,
      promptText: r.prompt_text_snapshot,
      topic: topicByPrompt.get(r.prompt_id as string) ?? null,
      provider: r.provider,
      rawText: r.raw_response_text,
      brandMentioned: r.extracted_json?.brand?.mentioned === true,
      citations: Array.isArray(r.extracted_json?.citations) ? r.extracted_json.citations : []
    }));
  const totalQuestions = new Set(rows.map((r) => r.prompt_id).filter(Boolean)).size;

  return {
    state: "ready",
    report: buildPurchaseQuestions(answers, { domain: project.domain, totalQuestions }),
    scannedAt: (run as { finished_at: string | null; created_at: string }).finished_at ?? (run as { created_at: string }).created_at
  };
}
