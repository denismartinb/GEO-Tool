/**
 * SCAN-TRACKED-SET-2 (docs/adr/0018) — dry-run report for the
 * tracked-competitor-set backfill. READ-ONLY: no data is written by this
 * script. All business logic lives in
 * lib/scan/backfill-tracked-competitor-set.ts (unit-tested); this file is
 * a thin CLI wrapper that supplies the real Supabase service client and
 * prints the report.
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the
 * environment (same as any other service-role script — never commit these).
 *
 * Run with:
 *   pnpm run backfill:tracked-competitor-set:dry-run
 * (equivalent to: npx tsx --tsconfig scripts/tsconfig.json scripts/backfill-tracked-competitor-set.ts)
 *
 * scripts/tsconfig.json exists ONLY so this script (run outside Next.js,
 * via tsx) can resolve the "server-only" package the same way
 * vitest.config.ts does for tests — it does not affect the Next.js build
 * or app/ tsconfig in any way.
 */
import { createServiceClient } from "@/lib/supabase/service";
import { runBackfillDryRun, summarizeDryRun } from "@/lib/scan/backfill-tracked-competitor-set";

async function main() {
  console.log("SCAN-TRACKED-SET-2 — dry run (read-only, writes nothing)\n");

  const service = createServiceClient();
  const result = await runBackfillDryRun(service);
  const summary = summarizeDryRun(result);

  console.log("Summary:");
  console.table([summary]);

  if (result.reports.length > 0) {
    console.log(`\nPer-run detail (${result.reports.length} runs need backfill):`);
    console.table(
      result.reports.map((r) => ({
        run_id: r.run_id,
        project_id: r.project_id,
        rows_touched: `${r.rows_touched}/${r.rows_total}`,
        geo_score: `${r.previous_geo_score ?? "—"} -> ${r.new_geo_score}`,
        delta: r.geo_score_delta,
        prominence_flip: r.prominence_flip,
        standing_flip: r.standing_flip
      }))
    );
  } else {
    console.log("\nNo runs need backfill.");
  }

  console.log("\nThis was a DRY RUN — nothing was written. Review this report before requesting the write pass.");
}

main().catch((error) => {
  console.error("Backfill dry-run failed:", error);
  process.exitCode = 1;
});
