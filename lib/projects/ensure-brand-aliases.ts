import "server-only";

import { deriveBrandAliases } from "@/lib/projects/business-profile";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Lazily derives a project's brand aliases the first time it is scanned
 * (GEO-SCORE-BRAND-IDENTITY-1b, founder-approved 2026-08-02).
 *
 * Why this exists: migration 0023 derives aliases at project CREATION only, so
 * every project that already existed keeps `'{}'` and stays mis-measured —
 * including the founder's own Mozilla project, the one that surfaced the bug
 * in the first place. Backfilling by hand does not scale and re-deriving on
 * every scan would burn a homepage fetch plus a Gemini call forever for the
 * majority of brands that legitimately have no aliases.
 *
 * `brand_aliases_derived_at` (migration 0024) is what makes "never derived"
 * distinguishable from "derived, and the answer was none" — the second is the
 * common case and must be remembered, not rediscovered.
 *
 * **Runs at scan LAUNCH, deliberately not inside `executePendingScan`.** The
 * executor works against a ~60s Vercel budget shared by every prompt's LLM
 * call (docs/adr/0003); adding a homepage fetch plus a Gemini call to that
 * path would spend the scan's own budget on setup and could push a full run
 * past its ceiling. Launch is a separate request with no such contention.
 *
 * Never throws and never blocks a scan. A failure here means this run is
 * scored without aliases — today's exact behavior — and `derived_at` stays
 * null so the next scan tries again. Measuring a brand slightly worse is
 * always preferable to not measuring it at all.
 */
export async function ensureBrandAliasesDerived(projectId: string): Promise<void> {
  try {
    const service = createServiceClient();

    const { data: project } = await service
      .from("projects")
      .select("id, brand, domain, brand_aliases_derived_at")
      .eq("id", projectId)
      .maybeSingle();

    // Already derived (even to an empty list) — nothing to do, ever again
    // until the user edits the list themselves.
    if (!project || project.brand_aliases_derived_at) return;
    if (!project.brand?.trim() || !project.domain?.trim()) return;

    const aliases = await deriveBrandAliases({ brand: project.brand, domain: project.domain });

    // Stamped even when `aliases` is empty: "we looked and there are none" is
    // a real, cacheable answer. Without the stamp this would re-run forever
    // for every brand that simply has no product names.
    await service
      .from("projects")
      .update({ brand_aliases: aliases, brand_aliases_derived_at: new Date().toISOString() })
      .eq("id", projectId);
  } catch {
    // Swallowed on purpose — see the docblock. The next scan retries.
  }
}
