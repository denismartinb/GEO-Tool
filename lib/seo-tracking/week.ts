/**
 * SEO-TRACK-1 (log §345): the week a SERP snapshot belongs to is the UTC date
 * of its Monday. One snapshot per keyword and week (`seo_serp_snapshots_uniq`),
 * so every pass of the Monday cron asks the same question: which tracked
 * keywords have no row for THIS week yet. Anchored to the calendar, never to
 * "seven days since the last one" (the moving-window bug of log §192).
 */
export function weekStartUtc(now: Date): string {
  const day = now.getUTCDay(); // 0 = Sunday
  const back = (day + 6) % 7;
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - back));
  return monday.toISOString().slice(0, 10);
}
