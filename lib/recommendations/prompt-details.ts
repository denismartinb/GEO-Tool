import type { AffectedPromptDetail } from "@/lib/recommendations/recommendation-engine";

export type GroupedPromptDetail = {
  id: string;
  prompt: string;
  providers: string[];
  competitors: string[];
  domains: string[];
};

/**
 * One row per prompt, with every engine that saw it (log §292).
 *
 * `affected_prompt_details` holds one entry per scan row, and a run asks the
 * same prompt to several engines, sometimes more than once. Listing the rows
 * as-is showed «que significa geo» four times under «8 prompts afectados»,
 * which reads as a duplicate bug and inflates a count the user takes at face
 * value. The engine stays visible as glyphs on the single row
 * (RECS-EVIDENCE-2: the engine is an attribute of the evidence, not a new
 * row), and a missing `provider` is still skipped, never guessed.
 */
export function groupPromptDetails(details: readonly AffectedPromptDetail[]): GroupedPromptDetail[] {
  const byPrompt = new Map<string, GroupedPromptDetail>();
  for (const d of details) {
    const key = d.prompt.trim().toLowerCase();
    let row = byPrompt.get(key);
    if (!row) {
      row = { id: d.id, prompt: d.prompt, providers: [], competitors: [], domains: [] };
      byPrompt.set(key, row);
    }
    if (d.provider && !row.providers.includes(d.provider)) row.providers.push(d.provider);
    for (const c of d.competitors ?? []) if (!row.competitors.includes(c)) row.competitors.push(c);
    for (const dom of d.domains ?? []) if (!row.domains.includes(dom)) row.domains.push(dom);
  }
  return Array.from(byPrompt.values());
}
