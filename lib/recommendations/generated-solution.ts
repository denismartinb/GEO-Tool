/**
 * Sanitized, copy-paste-ready AI solution for a recommendation — the shape
 * persisted in `generated_solutions.sanitized_content` for a
 * `rewriteRecommendationAction` result. Extracted from
 * app/dashboard/projects/[projectId]/recommendations/page.tsx (WEB-AUDIT-R5)
 * so the "Auditoría web" page can parse the same rows without duplicating
 * this logic a third time — it was already independently re-implemented
 * once, in recommendations-client.tsx's local types.
 *
 * Deliberately NOT the same module as lib/recommendations/rewrite-recommendation.ts's
 * own local GeneratedSolution/toExample — that one validates Gemini's raw
 * output at WRITE time (its own rules, its own risk surface, gated by
 * `.claude/rules/gemini.md`); this one defensively parses already-sanitized
 * JSON at READ time for display. Different concerns that could legitimately
 * diverge — not unified here.
 */

export type GeneratedSolutionExample = { label: string; content: string };

export type GeneratedSolution = {
  title: string;
  summary: string;
  steps: string[];
  examples: GeneratedSolutionExample[];
};

function toExample(value: unknown): GeneratedSolutionExample | null {
  const ex = value as { label?: unknown; content?: unknown } | null | undefined;
  if (ex && typeof ex.label === "string" && typeof ex.content === "string") {
    return { label: ex.label, content: ex.content };
  }
  return null;
}

/**
 * Parses a sanitized `generated_solutions.sanitized_content` JSON string into
 * a structured solution. Defensive: returns null on any unexpected shape
 * rather than crashing the caller (the content was sanitized server-side at
 * write time). Accepts the new `examples` array and the legacy single
 * `example` object.
 */
export function parseGeneratedSolution(raw: string): GeneratedSolution | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed.title !== "string" || typeof parsed.summary !== "string") return null;
    const steps = Array.isArray(parsed.steps) ? parsed.steps.filter((s): s is string => typeof s === "string") : [];
    const examples = Array.isArray(parsed.examples)
      ? parsed.examples.map(toExample).filter((e): e is GeneratedSolutionExample => e !== null)
      : [toExample(parsed.example)].filter((e): e is GeneratedSolutionExample => e !== null);
    return { title: parsed.title, summary: parsed.summary, steps, examples };
  } catch {
    return null;
  }
}
