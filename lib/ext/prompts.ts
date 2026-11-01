import type { ReportCell, ReportModel } from "@/lib/report/report-model";

/**
 * MCP-PROMPTS-1 (log §428): the prompts a domain follows, as «Prompts» lists
 * them. Pure: what each engine did with each prompt comes from the report
 * matrix of the latest scan (same rows, same mention rule as the console);
 * an active prompt that scan did not ask yet is «pending», never «no te
 * nombra».
 */

export type ExtPromptEngine = { label: string; cell: ReportCell };

export type ExtPrompt = {
  text: string;
  topic: string | null;
  /** Null while no scan has asked it yet. */
  engines: ExtPromptEngine[] | null;
};

export type ActivePrompt = { id: string; text: string; topic: string | null };

export function buildExtPrompts(input: {
  /** Null when the active list could not be read: then the scan's own prompts show. */
  active: readonly ActivePrompt[] | null;
  matrix: ReportModel["matrix"] | null;
  engineLabel: (provider: string) => string;
}): ExtPrompt[] {
  const scanned = new Map<string, ExtPrompt>();
  for (const g of input.matrix?.groups ?? []) {
    for (const r of g.rows) {
      scanned.set(r.promptId, {
        text: r.promptText,
        topic: g.topic || null,
        engines: r.cells.map((c) => ({ label: input.engineLabel(c.provider), cell: c.cell }))
      });
    }
  }
  if (!input.active) return [...scanned.values()];
  // The active prompts, in the scan's wording when it asked them; a prompt
  // retired after the scan drops out, as it does in «Prompts».
  return input.active.map((p) => scanned.get(p.id) ?? { text: p.text, topic: p.topic, engines: null });
}
