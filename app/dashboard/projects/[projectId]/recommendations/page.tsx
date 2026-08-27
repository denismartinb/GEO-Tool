import Link from "next/link";
import type { Metadata } from "next";
import { Icon } from "@/components/ui/icon";
import { InfoTip } from "@/components/ui/info-tip";
import { requireUser } from "@/lib/auth";
import { requireActiveProject } from "@/lib/project-workspace";
import { FirstScanTakeover } from "@/components/first-scan-takeover";
import { ScanStatePill } from "@/components/scan-state-pill";
import { COVERAGE_OVERLAY_TYPES, computeCoverageOverlay, type CoverageOverlayEntry } from "@/lib/recommendations/coverage-overlay";
import type { DomainCoverageTopic } from "@/lib/recommendations/domain-coverage";
import { parseGeneratedSolution } from "@/lib/recommendations/generated-solution";
import {
  verifyRecommendationPredictions,
  type RecommendationToVerify,
  type RecommendationVerification,
  type VerificationRow
} from "@/lib/recommendations/prediction-verification";
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
import { withAnalysisProgress } from "@/lib/scan/active-run-progress";
import { projectScreenMetadata } from "@/lib/seo/console-metadata";
import { RecommendationsClient, type GeneratedSolution, type Recommendation } from "./recommendations-client";

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

/**
 * Parses a `domain_coverage` generated_solutions row's sanitized_content
 * (DOMAIN-COVERAGE-1's DomainCoverageMap shape) defensively — same pattern as
 * parseGeneratedSolution below. Not imported from lib/recommendations/domain-
 * coverage.ts (server-only module already used for its type + constants here,
 * but this parser mirrors its private one to keep this file's error handling
 * self-contained).
 */
function parseCoverageMap(raw: string | null): { scanId: string; topics: DomainCoverageTopic[] } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed.scanId !== "string" || !Array.isArray(parsed.topics)) return null;
    const topics = parsed.topics.filter((t): t is DomainCoverageTopic => {
      const c = t as Record<string, unknown> | null;
      return Boolean(c) && typeof c?.promptId === "string" && typeof c?.found === "boolean";
    });
    return { scanId: parsed.scanId, topics };
  } catch {
    return null;
  }
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
  const { supabase } = await requireUser();

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
            "id, priority_rank, title, description, recommendation_type, impact, effort, confidence, status, source_type, evidence_json, consecutive_runs_open",
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
            "id, title, description, recommendation_type, status, updated_at, run_id, resolved_in_run_id, evidence_json",
          )
          .eq("project_id", projectId)
          .in("status", ["resolved", "dismissed"])
          .order("updated_at", { ascending: false })
          .limit(30),
      ])
    : [{ data: null }, { data: null }, { data: null }];

  const activeRun = await activeRunPromise;

  const baseRecs = (recommendations ?? []) as Recommendation[];

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

  const recentWins = dedupeByTitle(
    (resolvedRecommendations ?? []) as Array<{
      id: string;
      title: string;
      recommendation_type: string;
    }>,
  );

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

  // RECS-LOOP-1 Fase A: verify, for each auto-resolved history row, whether
  // the specific mutation its potential-points estimate assumed actually
  // happened in the run that confirmed the gap gone — never a score delta
  // (see lib/recommendations/prediction-verification.ts for why). Dismissed
  // rows never get a verdict here: dismissRecommendationCore never sets
  // resolved_in_run_id, so there is no confirming run to check against yet
  // (RECS-LOOP-1 Fase B, not this phase).
  const verificationByRecId = new Map<string, RecommendationVerification>();
  const resolvedRows = resolvedHistory.filter(
    (r): r is HistoryRow & { resolved_in_run_id: string } => r.status === "resolved" && Boolean(r.resolved_in_run_id),
  );
  if (resolvedRows.length > 0) {
    const oldRunIds = Array.from(new Set(resolvedRows.map((r) => r.run_id)));
    const newRunIds = Array.from(new Set(resolvedRows.map((r) => r.resolved_in_run_id)));
    const oldResultIds = Array.from(
      new Set(resolvedRows.flatMap((r) => r.evidence_json?.affected_prompt_details?.map((d) => d.id) ?? [])),
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

      const toVerify: RecommendationToVerify[] = resolvedRows.map((r) => ({
        id: r.id,
        recommendationType: r.recommendation_type,
        resolvedInRunId: r.resolved_in_run_id,
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

  // Trimmed to what the client actually renders — evidence_json/run_id stay
  // server-side, never sent over the wire for a compact history row.
  const resolvedHistoryForClient = resolvedHistory.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    recommendation_type: r.recommendation_type,
    status: r.status,
    updated_at: r.updated_at,
    verification: verificationByRecId.get(r.id) ?? null,
  }));

  // Attach the latest sanitized AI-generated solution (if any) for each
  // recommendation. These live in `generated_solutions` (never on the
  // recommendation row); the owner SELECT policy on that table makes this a
  // plain user-context read. Only completed + sanitized rows are renderable.
  const solutionByRecId = new Map<string, GeneratedSolution>();
  if (baseRecs.length > 0) {
    const { data: solutionRows } = await supabase
      .from("generated_solutions")
      .select("recommendation_id, sanitized_content, created_at")
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
    }>) {
      // Newest-first order means the first row seen per recommendation wins.
      if (solutionByRecId.has(row.recommendation_id) || !row.sanitized_content) continue;
      const parsed = parseGeneratedSolution(row.sanitized_content);
      if (parsed) solutionByRecId.set(row.recommendation_id, parsed);
    }
  }

  // RECS-COVERAGE-OVERLAY-1 (extended in AUDIT-RECS-JOIN-1 Fase B): read-time
  // enrichment of COVERAGE_OVERLAY_TYPES cards with already-persisted domain-
  // coverage data (DOMAIN-COVERAGE-1) for the CURRENT scan only — never the
  // recommendation engine or scan pipeline. See
  // lib/recommendations/coverage-overlay.ts for the join/degradation rules
  // and for why only these two (of fifteen) types are anchored to a single
  // prompt and can therefore ever match a coverage topic.
  const overlayEligibleRecs = baseRecs.filter((r) => COVERAGE_OVERLAY_TYPES.has(r.recommendation_type));
  const coverageOverlayByRecId = new Map<string, CoverageOverlayEntry>();
  if (overlayEligibleRecs.length > 0 && latestCompletedRun) {
    const resultIds = overlayEligibleRecs
      .map((r) => r.evidence_json?.affected_prompt_details?.[0]?.id)
      .filter((id): id is string => Boolean(id));

    const [{ data: resultRows }, { data: coverageRow }] = await Promise.all([
      resultIds.length > 0
        ? supabase
            .from("scan_prompt_results")
            .select("id, prompt_id")
            .eq("project_id", projectId)
            .eq("run_id", latestCompletedRun.id)
            .in("id", resultIds)
        : Promise.resolve({ data: [] as Array<{ id: string; prompt_id: string | null }> }),
      supabase
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
    ]);

    const resultIdToPromptId = new Map(
      ((resultRows ?? []) as Array<{ id: string; prompt_id: string | null }>)
        .filter((row): row is { id: string; prompt_id: string } => Boolean(row.prompt_id))
        .map((row) => [row.id, row.prompt_id]),
    );

    const coverage = parseCoverageMap(
      (coverageRow as { sanitized_content: string | null } | null)?.sanitized_content ?? null,
    );
    // Only a coverage row derived from THIS scan counts — a cached row from an
    // older scan (before the user re-ran "Auditar cobertura") never enriches.
    const coverageTopics = coverage && coverage.scanId === latestCompletedRun.id ? coverage.topics : [];

    for (const [recId, entry] of computeCoverageOverlay({
      recommendations: baseRecs.map((r) => ({
        id: r.id,
        recommendationType: r.recommendation_type,
        resultId: r.evidence_json?.affected_prompt_details?.[0]?.id ?? null,
        confidence: r.confidence as "low" | "medium" | "high",
      })),
      resultIdToPromptId,
      coverageTopics,
    })) {
      coverageOverlayByRecId.set(recId, entry);
    }
  }

  /* ---- RECS-REDESIGN-1: potential points on the Recomendaciones page ----
   * These already existed (RECS-POTENTIAL-1 / ADR 0017) but only ever
   * rendered in the Overview's Oportunidades block, so the page whose entire
   * job is "what should I do" was the one page that never showed what each
   * action is worth. Same counterfactual computation, same honest fallback:
   * null for non-quantifiable types or a low-confidence run, in which case
   * the card shows a qualitative impact instead of an invented number.
   */
  const [{ data: runScoreRow }, { data: allPromptResults }, { data: auditRow }] = latestCompletedRun
    ? await Promise.all([
        supabase
          .from("run_scores")
          .select("details_json")
          .eq("run_id", latestCompletedRun.id)
          .maybeSingle(),
        supabase
          .from("scan_prompt_results")
          .select(
            "id, prompt_text_snapshot, brand_mentioned, citation_found, mentioned_competitors_count, citations_count, sentiment, extracted_json, extraction_error, brand_snapshot, provider, extraction_version",
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
      ])
    : [{ data: null }, { data: null }, { data: null }];

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

  const recs: Recommendation[] = baseRecs.map((r) => ({
    ...r,
    solution: solutionByRecId.get(r.id) ?? null,
    coverageOverlay: coverageOverlayByRecId.get(r.id) ?? null,
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
  const jointPointsByType: Record<string, number | null> = {};
  if (scoreInputRows.length > 0) {
    const byType = new Map<string, Recommendation[]>();
    for (const rec of recs) {
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
      jointPointsByType[type] = joint && Math.round(joint.deltaPoints) > 0 ? Math.round(joint.deltaPoints) : null;
    }
  }

  // El plan se selecciona AQUI, no en el cliente, porque su techo de puntos
  // tiene que ser un contrafactual conjunto sobre esas mismas acciones —
  // sumar los deltas de las tres tarjetas contaria dos veces los prompts que
  // compartan (ADR 0017 §3). Calcularlo en cliente obligaria a sumar.
  const plan = selectPlan(recs);
  const planIds = plan.map((r) => r.id);
  const planJoint =
    scoreInputRows.length > 0 && plan.length > 0
      ? computeJointPotentialPoints(
          scoreInputRows,
          project.domain,
          plan.map((r) => ({
            recommendationType: r.recommendation_type,
            affectedPromptIds: affectedPromptIds(r.evidence_json),
          })),
        )
      : null;
  const planPoints = planJoint ? planJoint.deltaPoints : null;

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

  const total = recs.length;
  const latestRunFailed = latestRun?.status === "failed";

  const lastScanDate = latestCompletedRun
    ? new Date(
        latestCompletedRun.finished_at ?? latestCompletedRun.created_at,
      ).toLocaleDateString("es-ES", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Europe/Madrid",
      })
    : null;

  // Mirrors the FirstScanTakeover condition below — hidden while the mission
  // takeover owns the screen, so the rocket animation reads as full screen
  // instead of sitting under a second chrome band (founder, 2026-08-25).
  const showMissionTakeover = Boolean(activeRun) && !latestCompletedRun;

  return (
    <div className={`page fade-in${showMissionTakeover ? " mrk-fill" : ""}`}>
      {/* 1 · Cabecera estándar de sección, igual que Competidores, Prompts y
          Páginas citadas: kicker con el nombre de la sección, nombre del
          proyecto, contador y fecha de escaneo a la derecha. El rediseño la
          había sustituido por un titular propio, rompiendo la consistencia de
          la consola (revisión del fundador).

          Va FUERA de `.rec2-scope`, como en el resto de secciones: la cabecera
          sangra a los bordes de la página con márgenes negativos, y dentro de
          una columna centrada de 460px quedaría recortada. Se oculta mientras
          la misión del primer escaneo (abajo) ocupa la pantalla entera. */}
      {!showMissionTakeover && (
        <div className="ov-sticky-header">
          <div className="ov-sticky-left">
            <div>
              <p className="kicker" style={{ marginBottom: 2 }}>
                Recomendaciones
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 750, color: "var(--ink)", letterSpacing: "-.01em" }}>
                  {project.name}
                </span>
                {total > 0 && <span className="badge badge-neutral">{total} acciones</span>}
              </div>
            </div>
          </div>
          <div className="ov-sticky-right">
            <ScanStatePill activeRun={activeRun} lastScanLabel={lastScanDate} />
          </div>
        </div>
      )}

      {/* Alineada con Prompts, Competidores y Páginas citadas: el overlay a
          pantalla completa sólo sustituye a la pantalla cuando NO hay nada que
          enseñar. Esconder las recomendaciones que ya tienes detrás de un
          overlay porque hay un refresco en marcha era la única pantalla de
          datos que lo hacía, y la causa del PILOT FAIL repetido de
          "recommendations: estado vacío" (2026-08-04/05) — que no era una
          carrera con los datos, sino esta condición. Con datos, el estado del
          escaneo lo lleva la pastilla del sticky-header. */}
      {activeRun && showMissionTakeover ? (
        <FirstScanTakeover projectId={projectId} activeRun={activeRun} domain={project.domain} />
      ) : (
        <div className="rec2-scope">
          {latestRunFailed && latestCompletedRun && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 14px",
                background: "var(--warn-soft)",
                border: "1px solid #f3d086",
                borderRadius: "var(--r-md)",
                fontSize: 13,
                color: "var(--warn-ink)",
                marginBottom: 16,
              }}
            >
              <Icon name="info" size={14} />
              El último escaneo falló. Estas recomendaciones son del anterior.
            </div>
          )}

          {/* 2 · Blocking finding, above everything: while an AI crawler is
              blocked, the content actions below cannot pay off on that engine. */}
          {citationBlockers.map((blocker) => {
            const urls = blockerUrls(blocker);
            return (
              <div className="rec2-blocker" key={blocker.kind}>
                <Icon name="alert" size={16} />
                <div style={{ minWidth: 0 }}>
                  <div className="rec2-blocker-t">{blockerTitle(blocker)}</div>
                  <div className="rec2-blocker-d">
                    {blockerDetail(blocker)}{" "}
                    <Link href={`/dashboard/projects/${projectId}/web-audit`} style={{ fontWeight: 700 }}>
                      Ver cómo arreglarlo
                    </Link>
                  </div>
                  {/* La URL concreta: es lo primero en esta pantalla que señala
                      una página del cliente en vez de una consulta. */}
                  {urls.length > 0 && (
                    <ul
                      style={{
                        margin: "6px 0 0",
                        paddingLeft: 16,
                        fontSize: 12,
                        color: "var(--ink-2)",
                        lineHeight: 1.7,
                        wordBreak: "break-word"
                      }}
                    >
                      {urls.slice(0, 3).map((url) => (
                        <li key={url}>{url}</li>
                      ))}
                      {urls.length > 3 && <li>y {urls.length - 3} más</li>}
                    </ul>
                  )}
                </div>
              </div>
            );
          })}

          {/* 3 · Pillars — where the score stands, as context for the choices below. */}
          {pillars.length > 0 && (
            <div className="rec2-pillars">
              {pillars.map((p) => (
                <div key={p.key} className="rec2-pillar">
                  <div className="rec2-pillar-n">
                    {p.label}
                    {p.help && <InfoTip text={p.help} />}
                  </div>
                  <div className="rec2-pillar-v">{p.value}</div>
                  <div className="rec2-pillar-trk">
                    <i style={{ width: `${Math.max(0, Math.min(100, p.value))}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!latestCompletedRun ? (
            <div className="section-empty" style={{ marginTop: 20 }}>
              <div className="section-empty-title">
                {latestRunFailed ? "El último escaneo falló" : "Todavía no hay recomendaciones"}
              </div>
              <div className="section-empty-desc">
                {latestRunFailed
                  ? "No hay ningún escaneo completado del que sacar acciones. Revisa el dominio y vuelve a lanzarlo."
                  : "Aparecerán en cuanto termine tu primer escaneo."}
              </div>
              <Link
                href={`/dashboard/projects/${projectId}`}
                className="btn btn-ghost btn-sm"
                style={{ marginTop: 14, display: "inline-flex" }}
              >
                Volver a visión general
                <Icon name="arrRight" size={14} />
              </Link>
            </div>
          ) : recs.length === 0 ? (
            <div className="section-empty" style={{ marginTop: 20 }}>
              <div className="section-empty-title">Nada que corregir ahora mismo</div>
              <div className="section-empty-desc">
                Este escaneo no ha encontrado ningún hueco accionable. Vuelve tras el próximo.
              </div>
              <Link
                href={`/dashboard/projects/${projectId}/runs/${latestCompletedRun.id}`}
                className="btn btn-ghost btn-sm"
                style={{ marginTop: 14, display: "inline-flex" }}
              >
                Ver detalle del escaneo
                <Icon name="arrRight" size={14} />
              </Link>
            </div>
          ) : (
            <RecommendationsClient
              recommendations={recs}
              resolvedHistory={resolvedHistoryForClient}
              recentWinsCount={recentWins.length}
              projectId={projectId}
              jointPoints={jointPoints}
              jointPointsByType={jointPointsByType}
              planIds={planIds}
              planPoints={planPoints}
              domain={project.domain}
            />
          )}
        </div>
      )}
    </div>
  );
}
