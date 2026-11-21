import { isRetiredRecommendationType, overlayForHeadline, recommendationHeadline } from "@/lib/recommendations/headline";
import Link from "next/link";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { requireActiveProject } from "@/lib/project-workspace";
import { FirstScanTakeover } from "@/components/first-scan-takeover";
import { isAlreadyCovered } from "@/lib/recommendations/coverage-overlay";
import { loadCoverageOverlays } from "@/lib/recommendations/coverage-overlay-data";
import { parseGeneratedSolution } from "@/lib/recommendations/generated-solution";
import {
  verifyRecommendationPredictions,
  type RecommendationToVerify,
  type RecommendationVerification,
  type VerificationRow
} from "@/lib/recommendations/prediction-verification";
import { computeDismissalRecurrence, type RecurrenceVerdict } from "@/lib/recommendations/dismissal-recurrence";
import {
  computeJointPotentialPoints,
  computeRecommendationPotentialPoints,
  computeRunScoresFromResults,
  type ScoreInputRow,
} from "@/lib/scoring/run-scoring";
import type { BotAccessReport } from "@/lib/web-audit/robots";
import type { PageAuditEntry } from "@/lib/web-audit/technical-audit";
import {
  blockerDetail,
  blockerTitle,
  blockerUrls,
  findCitationBlockers
} from "@/lib/recommendations/citation-blockers";
import { selectPlan } from "@/lib/recommendations/plan";
import {
  collapseLeversForPlan,
  expandLeverIds,
  groupLevers,
  themeForRec,
  type LeverView,
} from "@/lib/recommendations/levers";
import { withAnalysisProgress } from "@/lib/scan/active-run-progress";
import { projectScreenMetadata } from "@/lib/seo/console-metadata";
import { type GeneratedSolution, type Recommendation } from "./recommendations-client";
import { InsRecommendations } from "@/components/ins/recs/ins-recommendations";
import { PageHead } from "@/components/ins/page-head";
import { Ic } from "@/components/ins/ic";
import { Roll } from "@/components/ins/kit/roll";
import { Bar } from "@/components/ins/kit/bar";
import { Motion } from "@/components/ins/kit/motion";
import { PriorityAlert } from "@/components/ins/overview/blocks";
import { LiveScanCard } from "@/components/ins/overview/live-scan-card";
import { getLLMScanProviders } from "@/lib/scan/providers";
import { GoogleLaterSlot, GooglePlanSlot } from "./_components/google-recs";
import { readSearchConsoleAvailability } from "@/lib/search-console/load";
import { GscConnectRow } from "../_components/gsc-connect-invite";

/** Affected prompt ids off an evidence_json blob, defensively. */
function affectedPromptIds(evidenceJson: unknown): string[] {
  if (!evidenceJson || typeof evidenceJson !== "object") return [];
  const ids = (evidenceJson as Record<string, unknown>).affected_prompt_ids;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
}

type GeoPillar = { key: string; label: string; value: number; help: string };

/**
 * Plain-language explanation of each GEO Score component, for the tooltip on
 * its box. Deliberately says what the number MEANS for the user's brand, not
 * how it is computed — the formula lives in docs/metodologia and in the
 * Overview; here the question being answered is "¿esto qué me está diciendo?".
 */
const PILLAR_HELP: Record<string, string> = {
  presence: "En cuántas de tus consultas te nombra la IA. Si no te nombra, no te pueden elegir.",
  prominence:
    "Cuando te nombra, si lo hace pronto o al final. Salir primero pesa mucho más que salir.",
  standing: "Cuánto espacio ocupas tú frente a tus competidores en el total de menciones.",
  authority: "Con qué frecuencia la IA usa tu web como fuente y te cita, en vez de citar a otros.",
};

/**
 * The four GEO Score components, read from the run's already-persisted
 * `details_json.geo_score.components` (ADR 0015). Any component the scorer
 * dropped for lack of data (prominence without positions, authority without
 * grounded rows) is simply absent here — never substituted with a zero, which
 * would read as "you scored 0" instead of "not measurable this run".
 */
function readPillars(details: unknown): GeoPillar[] {
  if (!details || typeof details !== "object") return [];
  const geo = (details as Record<string, unknown>).geo_score;
  if (!geo || typeof geo !== "object") return [];
  const components = (geo as Record<string, unknown>).components;
  if (!components || typeof components !== "object") return [];

  const LABELS: Array<{ key: string; label: string }> = [
    { key: "presence", label: "Presencia" },
    { key: "prominence", label: "Prominencia" },
    { key: "standing", label: "Cuota de voz" },
    { key: "authority", label: "Autoridad" },
  ];

  const out: GeoPillar[] = [];
  for (const { key, label } of LABELS) {
    const raw = (components as Record<string, unknown>)[key];
    const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>).value : null;
    if (typeof value === "number" && Number.isFinite(value)) {
      out.push({ key, label, value: Math.round(value), help: PILLAR_HELP[key] ?? "" });
    }
  }
  return out;
}

// Server Actions inherit the maxDuration of the page they're invoked from.
// Without this, "Mejorar redaccion con IA" (a Gemini call, see
// rewriteRecommendationAction) is bound by Vercel's default function
// duration instead of the 20s in-app Gemini timeout in lib/llm/gemini.ts,
// so a slow call gets killed by the platform before that timeout can ever
// surface a clean, user-visible error.
export const maxDuration = 60;

// ROOT-METADATA-1: el dominio va en la pestaña. Sin esto las pantallas de
// consola heredaban `title: "GenScore"` del layout raíz y eran indistinguibles
// entre sí y entre proyectos. `requireActiveProject` está memoizada por
// petición, así que esto no añade ninguna consulta.
export async function generateMetadata({
  params
}: {
  params: Promise<{ projectId: string }>;
}): Promise<Metadata> {
  const { projectId } = await params;
  return projectScreenMetadata("Recomendaciones", async () => (await requireActiveProject(projectId)).domain);
}

export default async function RecommendationsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await requireActiveProject(projectId);
  const { supabase, user } = await requireUser();

  // Dos lecturas de `scan_runs` en paralelo, no tres en fila
  // (PRELAUNCH-HARDENING-1 Fase V, V7). Eran tres `await` encadenados contra
  // la misma tabla y el mismo `project_id`, sin ninguna dependencia entre
  // ellos: el usuario pagaba la suma de tres viajes en vez del más lento.
  //
  // Y la tercera sobraba del todo: pedía "el último run de cualquier estado"
  // con `order(created_at desc).limit(1)`, que es exactamente la primera fila
  // de esta lista de 5 ordenada igual. Se deriva abajo en vez de volver a
  // preguntarlo.
  const [{ data: latestCompletedRun }, { data: recentRuns }] = await Promise.all([
    // Latest completed run
    supabase
      .from("scan_runs")
      .select("id, status, created_at, finished_at")
      .eq("project_id", projectId)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Recent runs to detect an in-progress scan (pending|running)
    supabase
      .from("scan_runs")
      .select("id, status, total_prompts, successful_prompts, failed_prompts, started_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(5)
  ]);

  // El run más reciente sea cual sea su estado — para el aviso de "el último
  // escaneo falló". Misma fila que devolvía la consulta eliminada.
  const latestRun = recentRuns?.[0];

  const rawActiveRun = recentRuns?.find((r) => r.status === "pending" || r.status === "running");
  // EXTRACTION-RELIABILITY-1 Fase C: carries the analysis-stage counters, so
  // the progress bar keeps moving once generation is done instead of pinning
  // at 100% while extraction is still working.
  //
  // Se lanza aquí y se espera después del lote de recomendaciones
  // (PRELAUNCH-HARDENING-1 Fase V, V7): ninguno de los dos consume el
  // resultado del otro, así que esperarla en esta línea añadía una ronda
  // serializada más a cada render. Dejarla suelta es seguro porque
  // `withAnalysisProgress` captura sus propios errores y degrada al contador
  // de generación (lib/scan/active-run-progress.ts) — no puede rechazar, así
  // que no hay promesa sin manejar.
  const activeRunPromise = rawActiveRun
    ? withAnalysisProgress(supabase, projectId, rawActiveRun)
    : Promise.resolve(rawActiveRun);

  const [{ data: recommendations }, { data: resolvedRecommendations }, { data: history }] = latestCompletedRun
    ? await Promise.all([
        supabase
          .from("recommendations")
          .select(
            "id, priority_rank, title, description, recommendation_type, impact, effort, confidence, status, source_type, evidence_json, consecutive_runs_open, dedupe_key",
          )
          .eq("project_id", projectId)
          .eq("run_id", latestCompletedRun.id)
          .eq("status", "active")
          .order("priority_rank", { ascending: true }),
        // RECS-3 "Victorias recientes": gaps that were open last run and were
        // confirmed gone by this run's scan — resolved_in_run_id (not run_id,
        // which stays the run where the gap still existed) scopes this to the
        // latest completed run specifically.
        supabase
          .from("recommendations")
          .select("id, title, recommendation_type")
          .eq("project_id", projectId)
          .eq("status", "resolved")
          .eq("resolved_in_run_id", latestCompletedRun.id)
          .order("title", { ascending: true }),
        // "Resueltas" tab: full history (any run), both auto-resolved and
        // manually dismissed, so there's a persistent place to browse past
        // wins/actions instead of only the latest-run-scoped banner above.
        // Capped — these rows accumulate indefinitely (accepted for beta,
        // cleaned up via project hard-delete).
        supabase
          .from("recommendations")
          .select(
            "id, title, description, recommendation_type, status, updated_at, run_id, resolved_in_run_id, evidence_json, dedupe_key",
          )
          .eq("project_id", projectId)
          .in("status", ["resolved", "dismissed"])
          .order("updated_at", { ascending: false })
          .limit(30),
      ])
    : [{ data: null }, { data: null }, { data: null }];

  const activeRun = await activeRunPromise;

  // RECS-HEADLINES-1 (log §354): retired types have no task to offer; rows
  // stored before the change stay hidden until the next scan replaces them.
  const baseRecs = ((recommendations ?? []) as Recommendation[]).filter(
    (r) => !isRetiredRecommendationType(r.recommendation_type),
  );

  // A single logical prompt scanned by multiple LLM engines (Gemini + Claude)
  // produces one scan_prompt_results row per engine, so per-prompt gap cards
  // (increase_brand_visibility/add_citation_block) can generate two
  // near-identical titles for the same underlying query. The active backlog has
  // no count cap of its own either (RECS-CAP-REMOVE), so these two lists would
  // show the duplicates raw — dedupe by normalized title, keeping the first
  // (most relevant/most recent) row.
  function dedupeByTitle<T extends { title: string }>(rows: T[]): T[] {
    const seen = new Set<string>();
    const out: T[] = [];
    for (const row of rows) {
      const key = row.title.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(row);
    }
    return out;
  }

  type HistoryRow = {
    id: string;
    title: string;
    description: string;
    recommendation_type: string;
    status: "resolved" | "dismissed";
    updated_at: string;
    run_id: string;
    resolved_in_run_id: string | null;
    evidence_json: { affected_prompt_details?: Array<{ id: string; competitors: string[] }> } | null;
    dedupe_key: string;
  };

  // RECS-LOOP-1 Fase A: dedupeByTitle alone would collapse a real, distinct
  // event — a gap that closed, reopened, and closed again — because it only
  // keys on the normalized title, keeping whichever row sorts first
  // (newest). That erases exactly the history this phase exists to show.
  // Keying on title + the run that closed it (or, for a dismissed row with
  // no such run, the row's own id) still collapses the same-title,
  // same-confirming-run duplicate dedupeByTitle was built for (one logical
  // prompt scored by two engines), without erasing a separate resolution.
  function dedupeResolvedHistory(rows: HistoryRow[]): HistoryRow[] {
    const seen = new Set<string>();
    const out: HistoryRow[] = [];
    for (const row of rows) {
      const key = `${row.title.trim().toLowerCase()}:${row.status === "resolved" ? (row.resolved_in_run_id ?? "") : row.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(row);
    }
    return out;
  }

  const resolvedHistory = dedupeResolvedHistory((history ?? []) as HistoryRow[]);

  // RECS-LOOP-1 Fase B: for each dismissed history row, did the gap
  // (dedupe_key) come back in the first completed scan after the dismissal?
  // Same recurrence signal computeRecommendationTransition already uses to
  // decide "resolved" (recommendation-history.ts), applied to one pinned
  // later run instead of every subsequent one — see
  // lib/recommendations/dismissal-recurrence.ts for why the anchor is fixed
  // rather than a rolling "most recent run" check.
  const recurrenceByRecId = new Map<string, RecurrenceVerdict>();
  const dismissedRowsWithKey = resolvedHistory.filter(
    (r): r is HistoryRow & { dedupe_key: string } => r.status === "dismissed" && Boolean(r.dedupe_key),
  );
  if (dismissedRowsWithKey.length > 0) {
    const earliestDismissedAt = dismissedRowsWithKey.reduce(
      (min, r) => (r.updated_at < min ? r.updated_at : min),
      dismissedRowsWithKey[0].updated_at,
    );

    const { data: candidateRunRows } = await supabase
      .from("scan_runs")
      .select("id, created_at")
      .eq("project_id", projectId)
      .eq("status", "completed")
      .gt("created_at", earliestDismissedAt)
      .order("created_at", { ascending: true });

    const candidateRuns = (candidateRunRows ?? []) as Array<{ id: string; created_at: string }>;

    if (candidateRuns.length > 0) {
      const { data: candidateRecRows } = await supabase
        .from("recommendations")
        .select("run_id, dedupe_key")
        .eq("project_id", projectId)
        .in(
          "run_id",
          candidateRuns.map((r) => r.id),
        );

      const dedupeKeysByRunId = new Map<string, Set<string>>();
      for (const row of (candidateRecRows ?? []) as Array<{ run_id: string; dedupe_key: string }>) {
        const set = dedupeKeysByRunId.get(row.run_id) ?? new Set<string>();
        set.add(row.dedupe_key);
        dedupeKeysByRunId.set(row.run_id, set);
      }

      for (const [recId, verdict] of computeDismissalRecurrence({
        dismissedRows: dismissedRowsWithKey.map((r) => ({ id: r.id, dedupeKey: r.dedupe_key, dismissedAt: r.updated_at })),
        candidateRuns: candidateRuns.map((r) => ({ id: r.id, createdAt: r.created_at })),
        dedupeKeysByRunId,
      })) {
        recurrenceByRecId.set(recId, verdict);
      }
    }
  }

  // RECS-LOOP-1 Fase B, active-card memory: if the currently-active backlog
  // holds the same dedupe_key as a dismissal that recurred, the card carries
  // when it was previously marked done — so it does not silently re-teach a
  // gap the user already acted on once. Keyed on dedupe_key (not recId,
  // which is a fresh row every time the gap reappears), keeping the most
  // recent dismissal per key since `history` is already newest-first.
  const recurredDismissalByDedupeKey = new Map<string, string>();
  for (const r of dismissedRowsWithKey) {
    if (recurrenceByRecId.get(r.id)?.status !== "recurred") continue;
    if (!recurredDismissalByDedupeKey.has(r.dedupe_key)) {
      recurredDismissalByDedupeKey.set(r.dedupe_key, r.updated_at);
    }
  }

  // RECS-LOOP-1 Fase A+B: verify, for each history row with a later run to
  // check against, whether the specific mutation its potential-points
  // estimate assumed actually happened — never a score delta (see
  // lib/recommendations/prediction-verification.ts for why). A `resolved`
  // row's later run is `resolved_in_run_id` (the system detected the gap
  // gone); a `dismissed` row's is the anchor run above, only when the gap
  // did NOT recur there — showing the mutation detail next to "it came back"
  // would answer a question nobody asked while burying the one that matters.
  const verificationByRecId = new Map<string, RecommendationVerification>();
  const verifiableRows: Array<{ id: string; recommendation_type: string; run_id: string; anchor_run_id: string; evidence_json: HistoryRow["evidence_json"] }> = [
    ...resolvedHistory
      .filter((r): r is HistoryRow & { resolved_in_run_id: string } => r.status === "resolved" && Boolean(r.resolved_in_run_id))
      .map((r) => ({ id: r.id, recommendation_type: r.recommendation_type, run_id: r.run_id, anchor_run_id: r.resolved_in_run_id, evidence_json: r.evidence_json })),
    ...dismissedRowsWithKey
      .filter((r) => recurrenceByRecId.get(r.id)?.status === "did_not_recur")
      .map((r) => ({
        id: r.id,
        recommendation_type: r.recommendation_type,
        run_id: r.run_id,
        anchor_run_id: (recurrenceByRecId.get(r.id) as { status: "did_not_recur"; anchorRunId: string }).anchorRunId,
        evidence_json: r.evidence_json,
      })),
  ];

  if (verifiableRows.length > 0) {
    const oldRunIds = Array.from(new Set(verifiableRows.map((r) => r.run_id)));
    const newRunIds = Array.from(new Set(verifiableRows.map((r) => r.anchor_run_id)));
    const oldResultIds = Array.from(
      new Set(verifiableRows.flatMap((r) => r.evidence_json?.affected_prompt_details?.map((d) => d.id) ?? [])),
    );

    if (oldResultIds.length > 0) {
      const { data: oldRows } = await supabase
        .from("scan_prompt_results")
        .select("id, prompt_id")
        .eq("project_id", projectId)
        .in("run_id", oldRunIds)
        .in("id", oldResultIds);

      const oldResultIdToPromptId = new Map(
        ((oldRows ?? []) as Array<{ id: string; prompt_id: string | null }>)
          .filter((row): row is { id: string; prompt_id: string } => Boolean(row.prompt_id))
          .map((row) => [row.id, row.prompt_id]),
      );

      const promptIds = Array.from(new Set(oldResultIdToPromptId.values()));
      const { data: newRows } =
        promptIds.length > 0
          ? await supabase
              .from("scan_prompt_results")
              .select("run_id, prompt_id, provider, brand_mentioned, citation_found, extracted_json")
              .eq("project_id", projectId)
              .in("run_id", newRunIds)
              .in("prompt_id", promptIds)
          : { data: [] as Array<{ run_id: string; prompt_id: string | null } & VerificationRow> };

      const newRunRowsByRunAndPrompt = new Map<string, VerificationRow[]>();
      for (const row of (newRows ?? []) as Array<{ run_id: string; prompt_id: string | null } & VerificationRow>) {
        if (!row.prompt_id) continue;
        const key = `${row.run_id}:${row.prompt_id}`;
        const existing = newRunRowsByRunAndPrompt.get(key) ?? [];
        existing.push(row);
        newRunRowsByRunAndPrompt.set(key, existing);
      }

      const toVerify: RecommendationToVerify[] = verifiableRows.map((r) => ({
        id: r.id,
        recommendationType: r.recommendation_type,
        anchorRunId: r.anchor_run_id,
        affectedPrompts: (r.evidence_json?.affected_prompt_details ?? []).map((d) => ({
          resultId: d.id,
          competitors: d.competitors ?? [],
        })),
      }));

      for (const [recId, verdict] of verifyRecommendationPredictions({
        recommendations: toVerify,
        oldResultIdToPromptId,
        newRunRowsByRunAndPrompt,
        projectDomain: project.domain,
      })) {
        verificationByRecId.set(recId, verdict);
      }
    }
  }

  // Trimmed to what the client actually renders — evidence_json stays
  // server-side, never sent over the wire for a compact history row.
  // `run_id` DOES cross now (ACTIONS-OBSERVABLE-1 slice 4a): it's what gates
  // the durable "Deshacer" on a dismissed row to the current run — see
  // ResolvedHistoryItem.run_id's own doc comment in recommendations-client.tsx.
  const resolvedHistoryForClient = resolvedHistory.map((r) => ({
    id: r.id,
    title: recommendationHeadline(r).title,
    description: r.description,
    recommendation_type: r.recommendation_type,
    status: r.status,
    updated_at: r.updated_at,
    run_id: r.run_id,
    verification: verificationByRecId.get(r.id) ?? null,
    recurrence: r.status === "dismissed" ? (recurrenceByRecId.get(r.id) ?? null) : null,
  }));

  // Attach the latest sanitized AI-generated solution (if any) for each
  // recommendation. These live in `generated_solutions` (never on the
  // recommendation row); the owner SELECT policy on that table makes this a
  // plain user-context read. Only completed + sanitized rows are renderable.
  const solutionByRecId = new Map<string, GeneratedSolution>();
  // RECS-ONE-LEVER-1: a plan generated for a whole lever is flagged in its
  // evidence and only ever shown on that lever's card, never on a single one.
  const leverSolutionByRecId = new Map<string, GeneratedSolution>();
  if (baseRecs.length > 0) {
    const { data: solutionRows } = await supabase
      .from("generated_solutions")
      .select("recommendation_id, sanitized_content, evidence_json, created_at")
      .eq("project_id", projectId)
      .eq("status", "completed")
      .eq("is_sanitized", true)
      .in(
        "recommendation_id",
        baseRecs.map((r) => r.id),
      )
      .order("created_at", { ascending: false });

    for (const row of (solutionRows ?? []) as Array<{
      recommendation_id: string;
      sanitized_content: string | null;
      evidence_json?: { lever?: unknown } | null;
    }>) {
      // Newest-first order means the first row seen per recommendation wins.
      const target = row.evidence_json?.lever === true ? leverSolutionByRecId : solutionByRecId;
      if (target.has(row.recommendation_id) || !row.sanitized_content) continue;
      const parsed = parseGeneratedSolution(row.sanitized_content);
      if (parsed) target.set(row.recommendation_id, parsed);
    }
  }

  // RECS-COVERAGE-OVERLAY-1, RECS-COVERAGE-1 (log §330): read-time coverage
  // verdict of each card, from rows we already hold (coverage map of this
  // scan, the sitemap the technical audit keeps). Same loader as Visión
  // general and the bell (RECS-ALREADY-DONE-1, log §339).
  const coverageOverlayByRecId = await loadCoverageOverlays(supabase, {
    projectId,
    runId: latestCompletedRun?.id ?? null,
    projectDomain: project.domain,
    recs: baseRecs,
  });

  /* ---- RECS-REDESIGN-1: potential points on the Recomendaciones page ----
   * These already existed (RECS-POTENTIAL-1 / ADR 0017) but only ever
   * rendered in the Overview's Oportunidades block, so the page whose entire
   * job is "what should I do" was the one page that never showed what each
   * action is worth. Same counterfactual computation, same honest fallback:
   * null for non-quantifiable types or a low-confidence run, in which case
   * the card shows a qualitative impact instead of an invented number.
   */
  const [{ data: runScoreRow }, { data: allPromptResults }, { data: auditRow }, { data: promptCategoryRows }] =
    latestCompletedRun
      ? await Promise.all([
          supabase
            .from("run_scores")
            .select("details_json")
            .eq("run_id", latestCompletedRun.id)
            .maybeSingle(),
          supabase
            .from("scan_prompt_results")
            .select(
              "id, prompt_id, prompt_text_snapshot, brand_mentioned, citation_found, mentioned_competitors_count, citations_count, sentiment, extracted_json, extraction_error, brand_snapshot, provider, extraction_version",
            )
            .eq("project_id", projectId)
            .eq("run_id", latestCompletedRun.id),
          // Bot access is project-level and already captured by the web audit —
          // reused here read-only so a blocked AI crawler surfaces on the page
          // where the user is deciding what to work on, not only inside the
          // audit screen they may never open.
          supabase
            .from("web_audit_snapshots")
            .select("bots, pages, created_at")
            .eq("project_id", projectId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          // RECS-ONE-LEVER-1: the topic of each prompt, to group the
          // visibility cards into one card per topic.
          supabase.from("project_prompts").select("id, category").eq("project_id", projectId),
        ])
      : [{ data: null }, { data: null }, { data: null }, { data: null }];

  const pillars = readPillars((runScoreRow as { details_json?: unknown } | null)?.details_json);

  const scoreInputRows: ScoreInputRow[] = ((allPromptResults ?? []) as ScoreInputRow[]).map((r) => ({
    id: r.id,
    prompt_text_snapshot: r.prompt_text_snapshot,
    brand_mentioned: r.brand_mentioned,
    citation_found: r.citation_found,
    mentioned_competitors_count: r.mentioned_competitors_count ?? 0,
    citations_count: r.citations_count ?? 0,
    sentiment: r.sentiment,
    extracted_json: r.extracted_json,
    extraction_error: r.extraction_error,
    brand_snapshot: r.brand_snapshot,
    provider: r.provider,
    extraction_version: r.extraction_version,
  }));

  const allRecs: Recommendation[] = baseRecs.map((r) => ({
    ...r,
    solution: solutionByRecId.get(r.id) ?? null,
    coverageOverlay: coverageOverlayByRecId.get(r.id) ?? null,
    // RECS-LOOP-1 Fase B: this exact gap came back after being marked done
    // once before — see recurredDismissalByDedupeKey above for why this is
    // keyed on dedupe_key (stable across the gap's re-occurrences) rather
    // than any row id (a fresh one every time the gap reappears).
    previouslyMarkedDoneAt: r.dedupe_key ? (recurredDismissalByDedupeKey.get(r.dedupe_key) ?? null) : null,
    potentialPoints:
      scoreInputRows.length > 0
        ? (computeRecommendationPotentialPoints(
            scoreInputRows,
            project.domain,
            r.recommendation_type,
            affectedPromptIds(r.evidence_json),
          )?.deltaPoints ?? null)
        : null,
  }));

  // RECS-ALREADY-DONE-1 (log §339): a card whose only action is to publish a
  // page that coverage already found has nothing left to do. It leaves the
  // active list, the plan and every ceiling, and shows under «Resueltas»
  // crossed out, with the page we found. Nothing is written: the next scan
  // regenerates the card and coverage decides again.
  const recs = allRecs.filter((r) => !isAlreadyCovered(r.recommendation_type, r.coverageOverlay));
  const coveredForClient = allRecs
    .filter((r) => isAlreadyCovered(r.recommendation_type, r.coverageOverlay))
    .map((r) => ({
      id: r.id,
      title: recommendationHeadline(r, overlayForHeadline(r.coverageOverlay)).title,
      description: r.description,
      recommendation_type: r.recommendation_type,
      status: "covered" as const,
      updated_at: latestCompletedRun?.finished_at ?? latestCompletedRun?.created_at ?? new Date().toISOString(),
      run_id: latestCompletedRun?.id ?? "",
      verification: null,
      recurrence: null,
      coveredPageUrl: r.coverageOverlay?.verifiedPage?.url ?? null,
    }));
  const historyForClient = [...coveredForClient, ...resolvedHistoryForClient];

  // RECS-ONE-LEVER-1: the visibility cards grouped by topic, one card per
  // topic in presentation only (every member stays its own row). Each lever
  // gets one joint counterfactual over all its members (ADR 0017 §3).
  const categoryByPromptId = new Map(
    ((promptCategoryRows ?? []) as Array<{ id: string; category: string | null }>).map((row) => [row.id, row.category]),
  );
  const categoryByResultId = new Map<string, string | null>(
    ((allPromptResults ?? []) as Array<{ id: string; prompt_id?: string | null }>).map((row) => [
      row.id,
      row.prompt_id ? (categoryByPromptId.get(row.prompt_id) ?? null) : null,
    ]),
  );
  const levers: LeverView[] = groupLevers(recs, (r) => themeForRec(r.evidence_json, categoryByResultId))
    .map((group) => {
      const joint =
        scoreInputRows.length > 0
          ? computeJointPotentialPoints(
              scoreInputRows,
              project.domain,
              group.members.map((r) => ({
                recommendationType: r.recommendation_type,
                affectedPromptIds: affectedPromptIds(r.evidence_json),
              })),
            )
          : null;
      return {
        key: group.key,
        theme: group.theme,
        representativeId: group.representative.id,
        memberIds: group.members.map((r) => r.id),
        points: joint ? joint.deltaPoints : null,
      };
    })
    .sort((a, b) => (b.points ?? -1) - (a.points ?? -1));
  const leverIdSet = new Set(levers.flatMap((l) => l.memberIds));
  const recById = new Map(recs.map((r) => [r.id, r]));
  const expandRecs = (items: Recommendation[]): Recommendation[] =>
    expandLeverIds(
      items.map((r) => r.id),
      levers,
    )
      .map((id) => recById.get(id))
      .filter((r): r is Recommendation => Boolean(r));

  // Joint ceiling across every active recommendation — never the sum of the
  // per-card deltas, which double-counts prompts shared by two rules (ADR 0017 §3).
  const jointPotential =
    scoreInputRows.length > 0
      ? computeJointPotentialPoints(
          scoreInputRows,
          project.domain,
          recs.map((r) => ({
            recommendationType: r.recommendation_type,
            affectedPromptIds: affectedPromptIds(r.evidence_json),
          })),
        )
      : null;
  const jointPoints =
    jointPotential && Math.round(jointPotential.deltaPoints) > 0 ? Math.round(jointPotential.deltaPoints) : null;

  // Per-type joint ceiling, for the collapsed group rows. Same rule as above:
  // one counterfactual over the union of the group's prompts, never the sum of
  // its members' individual deltas (ADR 0017 §3).
  // RECS-SHORT-CARD-1 (log §303): the groups sit under «Más adelante», which
  // leaves out the plan's cards, so their ceiling is computed without them.
  // A lever takes one plan slot, through its representative carrying the
  // lever's joint points (RECS-ONE-LEVER-1).
  const plan = selectPlan(collapseLeversForPlan(recs, levers));
  // RECS-ONE-QUEUE-1 (log §307): with Search Console connected, a Google card
  // can take slot 2 and the third AI action moves to «Más adelante». The page
  // doesn't wait for Google to know which, so it computes both ceilings.
  const googleAvailability = await readSearchConsoleAvailability(projectId, user.id);
  const googleConnected = googleAvailability === "active";
  // GSC-CONNECT-CTA-1 (log §313): without a connection, the row where the
  // Google cards would sit invites to connect instead.
  const googleInvite =
    googleAvailability === "disconnected" || googleAvailability === "reconnect" ? (
      <GscConnectRow projectId={projectId} state={googleAvailability} />
    ) : null;
  const groupCeilings = (excluded: Set<string>): Record<string, number | null> => {
    const out: Record<string, number | null> = {};
    if (scoreInputRows.length === 0) return out;
    const byType = new Map<string, Recommendation[]>();
    for (const rec of recs) {
      // Levers carry their own figure; their type is no longer a group.
      if (excluded.has(rec.id) || leverIdSet.has(rec.id)) continue;
      const bucket = byType.get(rec.recommendation_type) ?? [];
      bucket.push(rec);
      byType.set(rec.recommendation_type, bucket);
    }
    for (const [type, items] of byType) {
      if (items.length < 2) continue;
      const joint = computeJointPotentialPoints(
        scoreInputRows,
        project.domain,
        items.map((r) => ({
          recommendationType: r.recommendation_type,
          affectedPromptIds: affectedPromptIds(r.evidence_json),
        })),
      );
      out[type] = joint && Math.round(joint.deltaPoints) > 0 ? Math.round(joint.deltaPoints) : null;
    }
    return out;
  };
  const jointPointsByType = groupCeilings(new Set(expandRecs(plan).map((r) => r.id)));
  const jointPointsByTypeWithGoogle = googleConnected
    ? groupCeilings(new Set(expandRecs(plan.slice(0, 2)).map((r) => r.id)))
    : undefined;

  // El plan se selecciona AQUI, no en el cliente, porque su techo de puntos
  // tiene que ser un contrafactual conjunto sobre esas mismas acciones —
  // sumar los deltas de las tres tarjetas contaria dos veces los prompts que
  // compartan (ADR 0017 §3). Calcularlo en cliente obligaria a sumar.
  const planIds = plan.map((r) => r.id);
  const planJoint =
    scoreInputRows.length > 0 && plan.length > 0
      ? computeJointPotentialPoints(
          scoreInputRows,
          project.domain,
          expandRecs(plan).map((r) => ({
            recommendationType: r.recommendation_type,
            affectedPromptIds: affectedPromptIds(r.evidence_json),
          })),
        )
      : null;
  const planPoints = planJoint ? planJoint.deltaPoints : null;
  const planJointWithGoogle =
    googleConnected && scoreInputRows.length > 0 && plan.length > 0
      ? computeJointPotentialPoints(
          scoreInputRows,
          project.domain,
          expandRecs(plan.slice(0, 2)).map((r) => ({
            recommendationType: r.recommendation_type,
            affectedPromptIds: affectedPromptIds(r.evidence_json),
          })),
        )
      : null;
  const planPointsWithGoogle = planJointWithGoogle ? planJointWithGoogle.deltaPoints : null;

  /* Diagnóstico de por qué NO hay cifra de puntos — SOLO en logs de servidor.
   *
   * Una ausencia silenciosa es indistinguible de un fallo, y sin esta traza
   * hicieron falta tres rondas de suposiciones para entender por qué las
   * tarjetas no mostraban "+X pt". Pero eso es un problema NUESTRO, no del
   * cliente: la pantalla nunca le cuenta al usuario que a la herramienta le
   * falta un dato o que una corrida salió pobre (decisión del fundador,
   * 2026-08-04). El usuario ve el impacto cualitativo, que es información
   * honesta y suficiente; el porqué se queda aquí.
   *
   * Sin identificadores de usuario ni contenido de las respuestas: solo el
   * proyecto, la corrida y los contadores que explican la decisión.
   */
  const anyQuantified = recs.some((r) => typeof r.potentialPoints === "number" && r.potentialPoints >= 0.1);
  if (!anyQuantified && recs.length > 0 && latestCompletedRun) {
    if (scoreInputRows.length === 0) {
      console.warn("[geo:recs] sin puntos potenciales: no se leyeron filas del escaneo", {
        projectId,
        runId: latestCompletedRun.id,
        recommendations: recs.length,
      });
    } else {
      const live = computeRunScoresFromResults(scoreInputRows, project.domain);
      const details = live.details_json as {
        clean_results_count?: number;
        total_results?: number;
        extraction_error_count?: number;
        geo_score?: { score?: number };
      };
      console.warn("[geo:recs] sin puntos potenciales en ninguna recomendación", {
        projectId,
        runId: latestCompletedRun.id,
        confidence: live.confidence,
        cleanResults: details.clean_results_count,
        totalResults: details.total_results,
        extractionErrors: details.extraction_error_count,
        geoScore: details.geo_score?.score ?? null,
        quantifiableTypes: recs.filter((r) => r.potentialPoints !== null).length,
        recommendations: recs.length,
      });
    }
  }

  // Blocked AI crawlers = a hard ceiling on everything else on this page.
  // AUDIT-RECS-JOIN-1 Fase A — los tres bloqueos que hacen imposible una cita,
  // no sólo el de los bots. Ver `lib/recommendations/citation-blockers.ts`.
  const auditSnapshot = auditRow as { bots: BotAccessReport | null; pages: PageAuditEntry[] | null } | null;
  const citationBlockers = findCitationBlockers({
    bots: auditSnapshot?.bots ?? null,
    pages: auditSnapshot?.pages ?? null
  });

  const latestRunFailed = latestRun?.status === "failed";

  // Mirrors the FirstScanTakeover condition below: the mission owns the whole
  // screen, so nothing else is drawn (CONSOLE-INSTRUMENTO-1 F3b, log §355).
  const showMissionTakeover = Boolean(activeRun) && !latestCompletedRun;
  const googleSlotProps = { projectId, ownerUserId: user.id, domain: project.domain, supabase };

  if (activeRun && showMissionTakeover) {
    return (
      <div className="page mrk-fill">
        <FirstScanTakeover projectId={projectId} activeRun={activeRun} domain={project.domain} />
      </div>
    );
  }

  // The AI list, with the Google slots inside it (RECS-ONE-QUEUE-1, log §307).
  const aiHasList = Boolean(latestCompletedRun) && (recs.length > 0 || historyForClient.length > 0);
  const aiContent = !latestCompletedRun ? (
    <div className="empty-s">
      <b>{latestRunFailed ? "El último escaneo falló" : "Todavía no hay recomendaciones"}</b>
      <p>
        {latestRunFailed
          ? "No hay ningún escaneo completado del que sacar acciones. Revisa el dominio y vuelve a lanzarlo."
          : "Aparecerán en cuanto termine tu primer escaneo."}
      </p>
      <div style={{ marginTop: 12 }}>
        <Link href={`/dashboard/projects/${projectId}`} className="btn sm line">
          Volver a visión general
          <Ic n="arrowr" sm />
        </Link>
      </div>
    </div>
  ) : recs.length === 0 && historyForClient.length === 0 ? (
    // TRUST-METRICS-1 (docs/external-audit-2026-08.md, Fase 1): the
    // "Ver detalle del escaneo" link to /runs/[runId] is retired from this
    // empty state; the route is no longer part of the end-user console.
    //
    // ACTIONS-OBSERVABLE-1 slice 4a: this branch only fires when there is
    // truly nothing anywhere, active or historical, so marking the last
    // active card done never loses the "Resueltas" tab with its data.
    <div className="empty-s">
      <b>Nada que corregir ahora mismo</b>
      <p>Este escaneo no ha encontrado ningún hueco accionable. Vuelve tras el próximo.</p>
    </div>
  ) : (
    <InsRecommendations
      recommendations={recs}
      resolvedHistory={historyForClient}
      projectId={projectId}
      jointPointsByType={jointPointsByType}
      planIds={planIds}
      levers={levers}
      leverSolutions={Object.fromEntries(
        levers.flatMap((l) => {
          const solution = leverSolutionByRecId.get(l.representativeId);
          return solution ? [[l.representativeId, solution]] : [];
        }),
      )}
      planPoints={planPoints}
      planPointsWithGoogle={planPointsWithGoogle}
      jointPointsByTypeWithGoogle={jointPointsByTypeWithGoogle}
      latestCompletedRunId={latestCompletedRun.id}
      googleConnected={googleConnected}
      googlePlanSlot={
        googleConnected ? <GooglePlanSlot {...googleSlotProps} ins rank={plan.length > 0 ? 2 : 1} /> : null
      }
      googleLaterSlot={googleConnected ? <GoogleLaterSlot {...googleSlotProps} /> : googleInvite}
    />
  );

  const planWord = ["", "Una", "Dos", "Tres"][Math.min(3, plan.length)] ?? "";
  const lead = googleConnected || !planWord
    ? "Tu plan para esta semana. El resto, ordenado por palanca."
    : `${planWord} para esta semana. El resto, ordenado por palanca.`;

  return (
    <div className="ins">
      <Motion id={`recs:${projectId}`}>
        <div className="page">
          <PageHead title="Recomendaciones" lead={lead} />

          {/* One poller per screen: the card owns the refresh when the run ends. */}
          {activeRun ? (
            <LiveScanCard projectId={projectId} initial={activeRun} providers={getLLMScanProviders()} />
          ) : null}

          {latestRunFailed && latestCompletedRun ? (
            <div className="alert" role="status">
              <Ic n="warn" />
              <div className="tx">El último escaneo falló. Estas recomendaciones son del anterior.</div>
            </div>
          ) : null}

          {/* Blocking finding, above everything: while an AI crawler is blocked,
              the content actions below cannot pay off on that engine. */}
          {citationBlockers.map((blocker) => (
            <PriorityAlert
              key={blocker.kind}
              title={blockerTitle(blocker)}
              detail={blockerDetail(blocker)}
              urls={blockerUrls(blocker)}
              href={`/dashboard/projects/${projectId}/web-audit`}
            />
          ))}

          {/* RECS-ONE-QUEUE-1 (log §307): one queue. The Google cards live
              inside it (slot 2 of the plan, and a row at the top of «Más
              adelante»). With no AI list to sit in, every Google card goes to the row. */}
          {aiContent}
          {googleConnected && !aiHasList ? <GoogleLaterSlot {...googleSlotProps} includePlan /> : null}
          {!aiHasList ? googleInvite : null}

          {/* Where the score stands: context, so it goes after the actions
              (CONSOLE-PAGE-TEMPLATE-1). */}
          {pillars.length > 0 ? (
            <section className="sec">
              <div className="pillars">
                {pillars.map((pillar, i) => (
                  <div key={pillar.key}>
                    <div className="l">{pillar.label}</div>
                    <b className="num">
                      <Roll value={pillar.value} />
                    </b>
                    <Bar value={pillar.value} cls={`thin${pillar.value < 25 ? " warm" : ""}`} delay={i * 80} />
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </Motion>
    </div>
  );
}
