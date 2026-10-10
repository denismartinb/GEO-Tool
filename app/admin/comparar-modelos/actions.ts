"use server";

import { requireOperator } from "@/lib/admin/operator";
import { parsePersistedBusinessProfile } from "@/lib/projects/business-profile";
import { computeSampleCount } from "@/lib/scan/sampling";
import {
  COMPARE_ENGINES,
  COMPARE_LIMITS,
  CURRENT,
  findExtractionOption,
  isAllowedGenerationModel,
  type CompareEngine,
  type PassModels
} from "@/lib/model-compare/catalogue";
import {
  COMPARE_PASSES,
  summarizeComparison as summarize,
  type CompareAnswer,
  type ComparePass,
  type CompareSummary
} from "@/lib/model-compare/compare";
import { runCompareAnswer, type CompareProject } from "@/lib/model-compare/run-compare-answer";

/**
 * MODEL-COMPARE-1 (log §263) — the operator's model comparison, one step at
 * a time: one question × the chosen engines × one repetition × one pass,
 * engines in parallel. The browser drives the steps, same shape and same
 * reason as `/admin/estudio` (a whole comparison is minutes of provider
 * calls in a 60 s function).
 *
 * Gate: `requireOperator()` inside every action (.claude/rules/admin.md).
 * Reads one project through the operator's service client and writes
 * nothing: the only cost is provider calls, bounded below and by the
 * page's spend cap. Every model id comes from the closed catalogue; the
 * project, its questions and its competitors are re-read here on every step,
 * never taken from the browser.
 */
const PATH = "/admin/comparar-modelos";
const STEP_BUDGET_MS = 45_000;

export type CompareProjectOption = { id: string; domain: string; brand: string; promptCount: number };

export async function listCompareProjects(): Promise<CompareProjectOption[]> {
  const { service } = await requireOperator(PATH);
  const { data: projects } = await service
    .from("projects")
    .select("id, domain, brand")
    .eq("is_archived", false)
    .order("created_at", { ascending: false })
    .limit(200);
  if (!projects?.length) return [];
  const { data: prompts } = await service
    .from("project_prompts")
    .select("project_id")
    .eq("is_active", true)
    .in(
      "project_id",
      projects.map((p) => p.id)
    );
  const counts = new Map<string, number>();
  for (const row of prompts ?? []) counts.set(row.project_id, (counts.get(row.project_id) ?? 0) + 1);
  return projects
    .map((p) => ({ id: p.id, domain: p.domain, brand: p.brand, promptCount: counts.get(p.id) ?? 0 }))
    .filter((p) => p.promptCount > 0);
}

type LoadedProject = { project: CompareProject; prompts: string[]; samplingEnabled: boolean };

async function loadProject(service: Awaited<ReturnType<typeof requireOperator>>["service"], projectId: string): Promise<LoadedProject> {
  if (typeof projectId !== "string" || !/^[0-9a-f-]{36}$/i.test(projectId)) throw new Error("bad_project");
  const [{ data: project }, { data: competitors }, { data: prompts }] = await Promise.all([
    service
      .from("projects")
      .select("domain, brand, brand_aliases, country, language, business_profile")
      .eq("id", projectId)
      .eq("is_archived", false)
      .maybeSingle(),
    service
      .from("project_competitors")
      .select("name")
      .eq("project_id", projectId)
      .eq("is_active", true)
      .order("created_at", { ascending: true }),
    service
      .from("project_prompts")
      .select("prompt_text")
      .eq("project_id", projectId)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
  ]);
  if (!project) throw new Error("project_not_found");
  // Own query, failing toward the shipped behaviour (sampling on), as
  // run-creation.ts reads it (.claude/rules/scan.md).
  const { data: sampling } = await service.from("projects").select("sampling_enabled").eq("id", projectId).maybeSingle();
  return {
    project: {
      brand: project.brand,
      brandAliases: Array.isArray(project.brand_aliases) ? project.brand_aliases : [],
      domain: project.domain,
      country: project.country,
      language: project.language,
      competitors: (competitors ?? []).map((c) => c.name).filter(Boolean),
      profile: parsePersistedBusinessProfile(project.business_profile) ?? undefined
    },
    prompts: (prompts ?? []).map((p) => p.prompt_text).filter(Boolean),
    samplingEnabled: sampling?.sampling_enabled !== false
  };
}

function validEngines(engines: unknown): CompareEngine[] {
  if (!Array.isArray(engines)) throw new Error("no_engines");
  const valid = [...new Set(engines)].filter((e): e is CompareEngine => COMPARE_ENGINES.includes(e as CompareEngine));
  if (valid.length === 0) throw new Error("no_engines");
  return valid;
}

export async function runCompareStep(input: {
  projectId: string;
  pass: ComparePass;
  engines: CompareEngine[];
  /** Candidate generation models; only read for pass "b". */
  candidate: PassModels;
  /** Candidate extraction option id; only read for pass "b". */
  extractionId: string;
  promptIndex: number;
  sample: number;
}): Promise<CompareAnswer[]> {
  const { service } = await requireOperator(PATH);
  const { project, prompts } = await loadProject(service, input.projectId);

  if (!COMPARE_PASSES.includes(input.pass)) throw new Error("bad_pass");
  const engines = validEngines(input.engines);
  const usable = Math.min(prompts.length, COMPARE_LIMITS.maxPrompts);
  if (!Number.isInteger(input.promptIndex) || input.promptIndex < 0 || input.promptIndex >= usable) {
    throw new Error("bad_prompt_index");
  }
  if (!Number.isInteger(input.sample) || input.sample < 0 || input.sample >= COMPARE_LIMITS.maxSamples) {
    throw new Error("bad_sample");
  }
  const isCandidate = input.pass === "b";
  const extraction = isCandidate ? findExtractionOption(input.extractionId) : findExtractionOption("native");
  if (!extraction) throw new Error("bad_extraction");
  for (const engine of engines) {
    const id = isCandidate ? input.candidate?.[engine] : CURRENT;
    if (typeof id !== "string" || !isAllowedGenerationModel(engine, id)) throw new Error("bad_model");
  }

  const deadlineAt = Date.now() + STEP_BUDGET_MS;
  return Promise.all(
    engines.map((engine) =>
      runCompareAnswer({
        project,
        engine,
        pass: input.pass,
        generationModel: isCandidate ? input.candidate[engine] : CURRENT,
        extraction: extraction.choice,
        promptIndex: input.promptIndex,
        promptText: prompts[input.promptIndex],
        sample: input.sample,
        deadlineAt
      })
    )
  );
}

/**
 * Scores the passes with the scan's own composite. Server-side because the
 * scoring module is server-only; the browser sends back the slim answers it
 * collected (`slimExtracted`), well under the 1 MB action body limit.
 */
export async function summarizeCompare(input: {
  projectId: string;
  engines: CompareEngine[];
  answers: CompareAnswer[];
}): Promise<CompareSummary & { answersPerEngineInScan: number }> {
  const { service } = await requireOperator(PATH);
  const { project, prompts, samplingEnabled } = await loadProject(service, input.projectId);
  const engines = validEngines(input.engines);
  if (!Array.isArray(input.answers)) throw new Error("bad_answers");

  // What one real scan of this project costs: its questions × the repetitions
  // the response floor would ask for, priced at the measured cost per answer.
  const { samples } = computeSampleCount({
    promptCount: prompts.length,
    engineCount: engines.length,
    planId: "pro",
    domain: project.domain,
    samplingEnabled
  });
  const answersPerEngineInScan = prompts.length * samples;
  return {
    ...summarize({
      answers: input.answers,
      project: { brand: project.brand, domain: project.domain },
      engines,
      answersPerEngineInScan
    }),
    answersPerEngineInScan
  };
}
