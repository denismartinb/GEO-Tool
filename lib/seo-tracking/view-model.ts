/**
 * SEO-TRACK-1 PR B (log §342): what «Posición en Google» shows of the tracked
 * keywords, built from the stored weekly snapshots. Pure: no Supabase, no
 * clock. The loader decides which rows; this decides what they say.
 *
 * Every position comes from a DataForSEO Top 20 snapshot. A keyword without a
 * snapshot this week is «pending», never «out of the Top 20»: that would be
 * a result we did not see.
 */

export type TopResult = { position: number; domain: string; url: string; title: string | null };

export type TopicRow = { id: string; name: string; target_url: string | null };
export type KeywordRow = { id: string; keyword: string; topic_id: string | null; tracked: boolean };
export type SnapshotRow = {
  keyword_id: string;
  week_start: string;
  status: string;
  own_position: number | null;
  own_url: string | null;
  own_title: string | null;
  top10: unknown;
  has_local_pack: boolean | null;
  questions: unknown;
};
export type CompetitorRow = { domain: string; is_own: boolean; referring_domains: number | null };

export type KeywordView = {
  id: string;
  keyword: string;
  topicId: string | null;
  /** «ok»: seen this week · «error»: the read failed · «pending»: no snapshot yet. */
  state: "ok" | "error" | "pending";
  position: number | null;
  /** Position the previous week; undefined when there is no snapshot that week. */
  previous: number | null | undefined;
  url: string | null;
  title: string | null;
  top10: TopResult[];
  previousTop10: TopResult[] | null;
  localPack: boolean;
  questions: string[];
};

export type TopicView = {
  id: string;
  name: string;
  targetUrl: string | null;
  keywords: KeywordView[];
  /** Rounded mean of the positions seen this week, null when none ranks. */
  averagePosition: number | null;
  pageOne: number;
  pageTwo: number;
  outside: number;
  pending: number;
  /** Mean position per week, oldest first; null where none of its keywords ranked. */
  history: Array<number | null>;
  localPack: boolean;
  questions: string[];
};

/** Keywords without a topic are grouped under this id. */
export const NO_TOPIC_ID = "sin-tema";
export const NO_TOPIC_NAME = "Sin tema";
export const HISTORY_WEEKS = 8;
const MAX_TOPIC_QUESTIONS = 6;

function readTop(value: unknown): TopResult[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const row = raw as Record<string, unknown>;
    const position = typeof row.position === "number" ? row.position : null;
    const domain = typeof row.domain === "string" ? row.domain : null;
    const url = typeof row.url === "string" ? row.url : null;
    if (position === null || !domain || !url) return [];
    return [{ position, domain, url, title: typeof row.title === "string" ? row.title : null }];
  });
}

function readQuestions(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((q): q is string => typeof q === "string" && q.trim().length > 0) : [];
}

/** The `HISTORY_WEEKS` Mondays ending at `latestWeek`, oldest first. */
export function weekSeries(latestWeek: string, count = HISTORY_WEEKS): string[] {
  const end = new Date(`${latestWeek}T00:00:00Z`).getTime();
  return Array.from({ length: count }, (_, i) => new Date(end - (count - 1 - i) * 7 * 86_400_000).toISOString().slice(0, 10));
}

function previousWeek(week: string): string {
  return weekSeries(week, 2)[0];
}

function mean(values: number[]): number | null {
  return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
}

export function buildTrackingView(input: {
  topics: TopicRow[];
  keywords: KeywordRow[];
  snapshots: SnapshotRow[];
  /** The Monday of the current week (`weekStartUtc`). */
  currentWeek: string;
}): { latestWeek: string | null; weeks: string[]; keywords: KeywordView[]; topics: TopicView[] } {
  const tracked = input.keywords.filter((k) => k.tracked);
  const byKeyword = new Map<string, Map<string, SnapshotRow>>();
  for (const snap of input.snapshots) {
    if (!byKeyword.has(snap.keyword_id)) byKeyword.set(snap.keyword_id, new Map());
    byKeyword.get(snap.keyword_id)!.set(snap.week_start, snap);
  }

  // The week shown is the newest one that has a snapshot, so the screen
  // keeps last week's photo until this Monday's pass has run.
  const weeksSeen = input.snapshots.map((s) => s.week_start).filter((w) => w <= input.currentWeek);
  const latestWeek = weeksSeen.length ? weeksSeen.reduce((a, b) => (a > b ? a : b)) : null;
  const weeks = latestWeek ? weekSeries(latestWeek) : [];
  const prevWeek = latestWeek ? previousWeek(latestWeek) : null;

  const keywords: KeywordView[] = tracked.map((k) => {
    const snaps = byKeyword.get(k.id);
    const now = latestWeek ? snaps?.get(latestWeek) : undefined;
    const before = prevWeek ? snaps?.get(prevWeek) : undefined;
    const ok = now?.status === "ok";
    return {
      id: k.id,
      keyword: k.keyword,
      topicId: k.topic_id,
      state: !now ? "pending" : ok ? "ok" : "error",
      position: ok ? now!.own_position : null,
      previous: before?.status === "ok" ? before.own_position : undefined,
      url: ok ? now!.own_url : null,
      title: ok ? now!.own_title : null,
      top10: ok ? readTop(now!.top10) : [],
      previousTop10: before?.status === "ok" ? readTop(before.top10) : null,
      localPack: ok && now!.has_local_pack === true,
      questions: ok ? readQuestions(now!.questions) : []
    };
  });

  const groups: Array<{ id: string; name: string; targetUrl: string | null }> = input.topics.map((t) => ({
    id: t.id,
    name: t.name,
    targetUrl: t.target_url
  }));
  const topicIds = new Set(groups.map((g) => g.id));
  if (keywords.some((k) => !k.topicId || !topicIds.has(k.topicId))) groups.push({ id: NO_TOPIC_ID, name: NO_TOPIC_NAME, targetUrl: null });

  const topics: TopicView[] = groups
    .map((group) => {
      const own = keywords.filter((k) => (group.id === NO_TOPIC_ID ? !k.topicId || !topicIds.has(k.topicId) : k.topicId === group.id));
      const seen = own.filter((k) => k.state === "ok");
      const ranked = seen.filter((k) => k.position !== null).map((k) => k.position as number);
      const history = weeks.map((week) =>
        mean(
          own.flatMap((k) => {
            const s = byKeyword.get(k.id)?.get(week);
            return s?.status === "ok" && s.own_position !== null ? [s.own_position] : [];
          })
        )
      );
      const questions = [...new Set(seen.flatMap((k) => k.questions))].slice(0, MAX_TOPIC_QUESTIONS);
      return {
        ...group,
        keywords: own,
        averagePosition: mean(ranked),
        pageOne: ranked.filter((p) => p <= 10).length,
        pageTwo: ranked.filter((p) => p > 10).length,
        outside: seen.filter((k) => k.position === null).length,
        pending: own.filter((k) => k.state !== "ok").length,
        history,
        localPack: seen.some((k) => k.localPack),
        questions
      };
    })
    .filter((t) => t.keywords.length > 0 || t.id !== NO_TOPIC_ID);

  return { latestWeek, weeks, keywords, topics };
}

/** Week-over-week summary of the Resumen card. */
export function weeklySummary(keywords: KeywordView[]) {
  const seen = keywords.filter((k) => k.state === "ok");
  const moved = seen.filter((k) => k.position !== null && typeof k.previous === "number");
  return {
    total: keywords.length,
    pageOne: seen.filter((k) => k.position !== null && k.position <= 10).length,
    up: moved.filter((k) => (k.position as number) < (k.previous as number)).length,
    down: moved.filter((k) => (k.position as number) > (k.previous as number)).length,
    outside: seen.filter((k) => k.position === null).length,
    biggestMoves: moved
      .filter((k) => k.position !== k.previous)
      .sort((a, b) => Math.abs((b.previous as number) - (b.position as number)) - Math.abs((a.previous as number) - (a.position as number)))
      .slice(0, 5)
  };
}
