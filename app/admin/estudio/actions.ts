"use server";

import { requireOperator } from "@/lib/admin/operator";
import { runSectorAnswer } from "@/lib/studies/run-sector-answer";
import { buildCustomStudy, ENGINES, SECTORS, type AnswerRecord, type Engine } from "@/lib/studies/sector-study";

/**
 * SECTOR-STUDY-1 — one step of a study from the operator console: one
 * question × the chosen engines × one sample, run in parallel.
 *
 * Why a step and not the whole study: 12 questions × 3 engines × 2 samples
 * is ~72 generation + 72 extraction calls, several minutes of work in a
 * 60 s function. The browser drives the steps and aggregates; each step is
 * budgeted against its own invocation (.claude/rules/scan.md).
 *
 * Two kinds of study: a predefined sector, or a custom one for one brand
 * (domain + the operator's questions + competitors), rebuilt and validated
 * here on every step — the browser's copy is never trusted.
 *
 * Gate: `requireOperator()` inside the action itself, never delegated to the
 * page (.claude/rules/admin.md). No database write — the only cost is the
 * provider calls, bounded by the inputs validated below.
 */
const STEP_BUDGET_MS = 45_000;

export type StudySpec =
  | { kind: "sector"; sectorId: string }
  | { kind: "custom"; domain: string; brand?: string; prompts: string[]; competitors: string[] };

export async function runSectorStudyStep(input: {
  spec: StudySpec;
  engines: Engine[];
  promptIndex: number;
  sample: number;
}): Promise<AnswerRecord[]> {
  await requireOperator("/admin/estudio");

  let sector;
  if (input.spec.kind === "sector") {
    const sectorId = input.spec.sectorId;
    sector = SECTORS.find((candidate) => candidate.id === sectorId);
    if (!sector) throw new Error("unknown_sector");
  } else {
    const built = buildCustomStudy(input.spec);
    if (!built.ok) throw new Error(built.error);
    sector = built.sector;
  }
  const engines = [...new Set(input.engines)].filter((engine): engine is Engine => ENGINES.includes(engine));
  if (engines.length === 0) throw new Error("no_engines");
  if (!Number.isInteger(input.promptIndex) || input.promptIndex < 0 || input.promptIndex >= sector.prompts.length) {
    throw new Error("bad_prompt_index");
  }
  if (!Number.isInteger(input.sample) || input.sample < 1 || input.sample > 3) throw new Error("bad_sample");

  const deadlineAt = Date.now() + STEP_BUDGET_MS;
  const config = sector;
  return Promise.all(
    engines.map((engine) =>
      runSectorAnswer({ sector: config, engine, promptIndex: input.promptIndex, sample: input.sample, deadlineAt })
    )
  );
}
