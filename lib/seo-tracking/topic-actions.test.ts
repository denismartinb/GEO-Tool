import { describe, expect, it } from "vitest";
import { buildTopicActions, missingTitleTerms, pagePath } from "@/lib/seo-tracking/topic-actions";
import { buildTrackingView, weeklySummary, weekSeries, NO_TOPIC_ID, type KeywordRow, type SnapshotRow } from "@/lib/seo-tracking/view-model";

const OWN = "clinicasol.es";
const top = (titles: string[], own?: { position: number; url: string }) =>
  titles.map((title, i) => ({ position: i + 1, domain: `rival${i}.es`, url: `https://rival${i}.es/x`, title })).map((r) =>
    own && r.position === own.position ? { ...r, domain: OWN, url: own.url } : r
  );

const madridTitles = [
  "Implantes dentales en Madrid",
  "Implantes Madrid precio",
  "Clínica de implantes en Madrid",
  "Implantes dentales Madrid",
  "Implantes dentales: precio",
  "Implantes en Madrid centro",
  "Implantes dentales",
  "Madrid implantes",
  "Implantes con garantía",
  "Implantes"
];

function snap(keyword_id: string, week_start: string, extra: Partial<SnapshotRow> = {}): SnapshotRow {
  return {
    keyword_id,
    week_start,
    status: "ok",
    own_position: null,
    own_url: null,
    own_title: null,
    top10: top(madridTitles),
    has_local_pack: false,
    questions: [],
    ...extra
  };
}

const W = "2026-10-19";
const PREV = "2026-10-12";

function view(snapshots: SnapshotRow[], keywords: KeywordRow[] = [
  { id: "k1", keyword: "implantes dentales madrid", topic_id: "t1", tracked: true },
  { id: "k2", keyword: "clínica implantes madrid", topic_id: "t1", tracked: true }
]) {
  return buildTrackingView({ topics: [{ id: "t1", name: "Implantes", target_url: null }], keywords, snapshots, currentWeek: W });
}

describe("buildTrackingView", () => {
  it("reads the newest week with data, its previous week and an 8-week history", () => {
    const v = view([
      snap("k1", W, { own_position: 14, own_url: "https://clinicasol.es/implantes" }),
      snap("k1", PREV, { own_position: 17, own_url: "https://clinicasol.es/implantes" }),
      snap("k2", W, { own_position: 12, own_url: "https://clinicasol.es/" })
    ]);
    expect(v.latestWeek).toBe(W);
    expect(v.weeks).toHaveLength(8);
    expect(v.weeks[7]).toBe(W);
    const t = v.topics[0];
    expect(t.averagePosition).toBe(13);
    expect(t.pageTwo).toBe(2);
    expect(t.history[7]).toBe(13);
    expect(t.history[6]).toBe(17);
    expect(t.history[0]).toBeNull();
    expect(v.keywords[0]).toMatchObject({ position: 14, previous: 17, state: "ok" });
  });

  it("keeps a keyword without this week's snapshot as pending, never as out of the Top 20", () => {
    const v = view([snap("k1", W, { own_position: 3 })]);
    expect(v.keywords[1].state).toBe("pending");
    expect(v.topics[0].outside).toBe(0);
    expect(v.topics[0].pending).toBe(1);
  });

  it("an error snapshot is not a position", () => {
    const v = view([snap("k1", W, { status: "error", own_position: null })]);
    expect(v.keywords[0].state).toBe("error");
    expect(v.topics[0].outside).toBe(0);
  });

  it("groups keywords without a topic and skips untracked ones", () => {
    const v = view([], [
      { id: "k1", keyword: "a", topic_id: null, tracked: true },
      { id: "k2", keyword: "b", topic_id: "t1", tracked: false }
    ]);
    expect(v.topics.map((t) => t.id)).toEqual(["t1", NO_TOPIC_ID]);
    expect(v.latestWeek).toBeNull();
    expect(v.keywords).toHaveLength(1);
  });

  it("weekly summary counts moves only where both weeks were seen", () => {
    const v = view([snap("k1", W, { own_position: 14 }), snap("k1", PREV, { own_position: 17 }), snap("k2", W)]);
    expect(weeklySummary(v.keywords)).toMatchObject({ total: 2, up: 1, down: 0, outside: 1, pageOne: 0 });
  });

  it("weekSeries walks back whole weeks", () => {
    expect(weekSeries(W, 3)).toEqual(["2026-10-05", "2026-10-12", W]);
  });
});

describe("missingTitleTerms", () => {
  it("finds a keyword word half the Top 10 titles carry and the own title lacks", () => {
    expect(missingTitleTerms("implantes dentales madrid", "Implantes dentales · Clínica Sol", top(madridTitles))).toEqual([{ term: "madrid", share: 0.6 }]);
  });
  it("says nothing without the own title or with too few titles", () => {
    expect(missingTitleTerms("implantes madrid", null, top(madridTitles))).toEqual([]);
    expect(missingTitleTerms("implantes madrid", "x", top(madridTitles.slice(0, 3)))).toEqual([]);
  });
});

describe("buildTopicActions", () => {
  const base = { ownDomain: OWN, rivals: [], ownReferringDomains: null, ctr: [] };

  it("asks for a page when nothing of the site ranks, naming the most repeated domains", () => {
    const v = view([snap("k1", W), snap("k2", W)]);
    const actions = buildTopicActions({ ...base, topic: v.topics[0] });
    expect(actions[0]).toMatchObject({ key: "create_page", type: "content" });
    expect(actions[0].why).toContain("rival0.es");
  });

  it("pushes the keyword closest to page 1 with the missing title word", () => {
    const v = view([
      snap("k1", W, { own_position: 14, own_url: "https://clinicasol.es/implantes", own_title: "Implantes dentales · Clínica Sol" }),
      snap("k2", W, { own_position: 18, own_url: "https://clinicasol.es/implantes", own_title: "Implantes dentales · Clínica Sol" })
    ]);
    const [first] = buildTopicActions({ ...base, topic: v.topics[0] });
    expect(first.key).toBe("near_page_one:implantes dentales madrid");
    expect(first.title).toBe("Lleva «implantes dentales madrid» del puesto 14 a la página 1");
    expect(first.why).toContain("faltan 4 puestos");
    expect(first.steps[0]).toContain("«madrid»");
  });

  it("flags two own pages sharing the topic", () => {
    const v = view([
      snap("k1", W, { own_position: 5, own_url: "https://clinicasol.es/implantes" }),
      snap("k2", W, { own_position: 6, own_url: "https://clinicasol.es/" })
    ]);
    const split = buildTopicActions({ ...base, topic: v.topics[0] }).find((a) => a.key.startsWith("split_pages"));
    expect(split?.steps[0]).toContain("enlaza a /implantes");
  });

  it("uses Search Console only for a keyword of the topic", () => {
    const v = view([snap("k1", W, { own_position: 3, own_url: "https://clinicasol.es/implantes" })]);
    const none = buildTopicActions({ ...base, topic: v.topics[0], ctr: [{ query: "otra cosa", page: null, position: 3 }] });
    expect(none.some((a) => a.key.startsWith("ctr"))).toBe(false);
    const some = buildTopicActions({ ...base, topic: v.topics[0], ctr: [{ query: "implantes dentales madrid", page: "https://clinicasol.es/implantes", position: 3 }] });
    expect(some.find((a) => a.key.startsWith("ctr"))?.title).toBe("Mejora el título y la descripción de /implantes");
  });

  it("names who entered ahead when a keyword drops", () => {
    const before = top(madridTitles);
    const now = before.map((r) => (r.position === 2 ? { ...r, domain: "nuevo.es" } : r));
    const v = view([
      snap("k1", W, { own_position: 15, top10: now }),
      snap("k1", PREV, { own_position: 9, top10: before })
    ]);
    const drop = buildTopicActions({ ...base, topic: v.topics[0] }).find((a) => a.key.startsWith("dropped"));
    expect(drop?.why).toContain("del puesto 9 al 15");
    expect(drop?.why).toContain("nuevo.es");
  });

  it("only talks about links when rivals in the Top 10 have several times more", () => {
    const v = view([snap("k1", W, { own_position: 4 })]);
    const rivals = [{ domain: "rival1.es", referringDomains: 200 }];
    expect(buildTopicActions({ ...base, topic: v.topics[0], rivals, ownReferringDomains: 100 }).some((a) => a.key === "links")).toBe(false);
    const links = buildTopicActions({ ...base, topic: v.topics[0], rivals, ownReferringDomains: 20 }).find((a) => a.key === "links");
    expect(links?.why).toContain("10 veces");
    expect(links?.steps[0]).not.toContain("rival1.es");
  });

  it("caps the steps and returns nothing before the first snapshot", () => {
    expect(buildTopicActions({ ...base, topic: view([]).topics[0] })).toEqual([]);
    const v = view([
      snap("k1", W, { own_position: 14, own_url: "https://clinicasol.es/implantes", own_title: "Implantes", has_local_pack: true, questions: ["¿Duele?"] }),
      snap("k2", W, { own_position: 6, own_url: "https://clinicasol.es/", own_title: "Inicio" })
    ]);
    expect(buildTopicActions({ ...base, topic: v.topics[0], rivals: [{ domain: "rival1.es", referringDomains: 500 }], ownReferringDomains: 5 }).length).toBe(4);
  });

  it("pagePath keeps the path only", () => {
    expect(pagePath("https://www.clinicasol.es/implantes/")).toBe("/implantes");
    expect(pagePath("https://clinicasol.es")).toBe("/");
  });
});
