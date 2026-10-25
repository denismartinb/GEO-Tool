import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Every scheduled route and the scheduler that fires it (CRON-HOBBY-1, log
 * §347). On Vercel Hobby only daily-or-rarer crons may live in `vercel.json`;
 * the frequent ones are pg_cron jobs in a hand-applied migration. Tests that
 * used to read `vercel.json` alone read both through here, so a cron moved
 * from one scheduler to the other is still checked.
 */
export type ScheduledCron = { path: string; schedule: string; via: "vercel" | "pg_cron" };

export const PG_CRON_MIGRATION = "supabase/migrations/0045_pg_cron_frequent_crons.sql";

export function readVercelCrons(): ScheduledCron[] {
  const raw = readFileSync(join(process.cwd(), "vercel.json"), "utf8");
  const crons = (JSON.parse(raw) as { crons?: Array<{ path: string; schedule: string }> }).crons ?? [];
  return crons.map((cron) => ({ ...cron, via: "vercel" }));
}

/** `select cron.schedule('genscore-x', '<expr>', $$select internal_cron.call_route('/api/cron/x')$$);` */
export function readPgCronCrons(): ScheduledCron[] {
  const sql = readFileSync(join(process.cwd(), PG_CRON_MIGRATION), "utf8");
  const pattern = /cron\.schedule\('[^']+',\s*'([^']+)',\s*\$\$select internal_cron\.call_route\('([^']+)'\)\$\$\)/g;
  return [...sql.matchAll(pattern)].map((match) => ({ path: match[2], schedule: match[1], via: "pg_cron" }));
}

export function readAllCrons(): ScheduledCron[] {
  return [...readVercelCrons(), ...readPgCronCrons()];
}
