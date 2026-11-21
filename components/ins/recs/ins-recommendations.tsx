"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Ic } from "@/components/ins/ic";
import { Deck, ProgressTicks, type Plate } from "@/components/ins/kit/deck";
import { Seg } from "@/components/ins/kit/seg";
import { prefersReducedMotion } from "@/components/ins/kit/use-media";
import {
  planSummary,
  type Recommendation,
  type ResolvedHistoryItem,
} from "@/app/dashboard/projects/[projectId]/recommendations/recommendations-client";
import {
  GooglePlanReport,
  type GooglePlanKind,
  type GooglePlanState,
} from "@/app/dashboard/projects/[projectId]/recommendations/_components/google-plan-state";
import type { GeneratedSolution } from "@/lib/recommendations/generated-solution";
import {
  MIN_VISIBLE_POINTS,
  formatPoints,
  selectPlan,
} from "@/lib/recommendations/plan";
import type { LeverView } from "@/lib/recommendations/levers";
import {
  cardFromLever,
  cardFromRec,
  groupCards,
  type CardGroup,
  type InsCard,
} from "@/lib/ins/recs-cards";
import { RecsContext, type DoneInfo } from "./actions";
import { LaterRow } from "./later-row";
import { PlanCard } from "./plan-card";
import { ResolvedRow } from "./resolved";

/**
 * Recomendaciones in the «Instrumento» system (CONSOLE-INSTRUMENTO-1 F4, log
 * §357): the plan of the week as a deck, «Más adelante» as lever groups with
 * a quiet lever index and compact rows, and «Resueltas» (CONSOLE-PAGE-TEMPLATE-1,
 * log §396, removed the search box and the focus layer). Every card, figure and action is the real
 * one: this component only lays them out (see `lib/ins/recs-cards.ts`).
 */

type Props = {
  recommendations: Recommendation[];
  resolvedHistory?: ResolvedHistoryItem[];
  projectId: string;
  jointPointsByType?: Record<string, number | null>;
  planIds?: string[];
  levers?: LeverView[];
  leverSolutions?: Record<string, GeneratedSolution>;
  planPoints?: number | null;
  planPointsWithGoogle?: number | null;
  jointPointsByTypeWithGoogle?: Record<string, number | null>;
  latestCompletedRunId?: string | null;
  googleConnected?: boolean;
  googlePlanSlot?: ReactNode;
  googleLaterSlot?: ReactNode;
};

const GROUP_SHOW = 3;

export function InsRecommendations({
  recommendations,
  resolvedHistory = [],
  projectId,
  jointPointsByType,
  planIds = [],
  levers = [],
  leverSolutions = {},
  planPoints = null,
  planPointsWithGoogle = null,
  jointPointsByTypeWithGoogle,
  latestCompletedRunId = null,
  googleConnected = false,
  googlePlanSlot = null,
  googleLaterSlot = null,
}: Props) {
  /* ---------- plan: what Google does with slot 2, and a plan that holds still ---------- */
  const [googlePlan, setGooglePlan] = useState<GooglePlanState>(
    googleConnected ? "pending" : null,
  );
  const [reportGooglePlan] = useState(
    () => (kind: GooglePlanKind | null) => setGooglePlan(kind),
  );
  const googleInPlan = googlePlan !== null;

  const recById = useMemo(
    () => new Map(recommendations.map((r) => [r.id, r])),
    [recommendations],
  );
  const leverByRep = useMemo(
    () => new Map(levers.map((l) => [l.representativeId, l])),
    [levers],
  );
  const leverMemberSet = useMemo(
    () => new Set(levers.flatMap((l) => l.memberIds)),
    [levers],
  );

  const makeCard = useCallback(
    (rec: Recommendation): InsCard => {
      const lever = leverByRep.get(rec.id);
      if (!lever) return cardFromRec(rec);
      const members = lever.memberIds
        .map((id) => recById.get(id))
        .filter((r): r is Recommendation => Boolean(r));
      const solution =
        lever.memberIds.length > 1
          ? (leverSolutions[lever.representativeId] ?? null)
          : (recById.get(lever.representativeId)?.solution ?? null);
      return cardFromLever(
        lever,
        members.length > 0 ? members : [rec],
        solution,
      );
    },
    [leverByRep, recById, leverSolutions],
  );

  // The plan is chosen once per scan and held for the visit: marking one done
  // must not pull a new card into the deck under the person's hands.
  const serverPlan = useMemo(
    () =>
      planIds.length > 0
        ? (planIds
            .map((id) => recById.get(id))
            .filter(Boolean) as Recommendation[])
        : selectPlan(recommendations),
    [planIds, recById, recommendations],
  );
  const [held, setHeld] = useState<{
    run: string | null;
    ids: string[];
  } | null>(null);
  if (held === null || held.run !== latestCompletedRunId) {
    setHeld({ run: latestCompletedRunId, ids: serverPlan.map((r) => r.id) });
  }
  const heldIds = held?.ids ?? serverPlan.map((r) => r.id);
  const cache = useRef(new Map<string, InsCard>());
  for (const id of heldIds) {
    const rec = recById.get(id);
    if (rec) cache.current.set(id, makeCard(rec));
  }
  const planCards = heldIds
    .map((id) => cache.current.get(id))
    .filter((c): c is InsCard => Boolean(c));
  const shownPlan = googleInPlan ? planCards.slice(0, 2) : planCards;
  const shownPlanIds = new Set(shownPlan.map((c) => c.id));

  /* ---------- local state ---------- */
  const [done, setDoneMap] = useState<Record<string, DoneInfo>>({});
  const [idx, setIdx] = useState(0);
  const [ltab, setLtab] = useState<"pend" | "res">("pend");
  const [lever, setLever] = useState<string | null>(null);
  const [row, setRow] = useState<string | null>(null);
  const [more, setMore] = useState<Record<string, boolean>>({});
  const laterRef = useRef<HTMLDivElement>(null);

  /* ---------- the deck ---------- */
  const googlePlate: Plate | null =
    googleConnected &&
    googlePlanSlot &&
    (googlePlan === "pending" || googleInPlan)
      ? { id: "google-plan", done: false, node: googlePlanSlot }
      : null;
  const aiPlates: Plate[] = shownPlan.map((card) => ({
    id: card.id,
    done: Boolean(done[card.id]),
    node: <PlanCard card={card} />,
  }));
  const plates: Plate[] = googlePlate
    ? [...aiPlates.slice(0, 1), googlePlate, ...aiPlates.slice(1)]
    : aiPlates;
  const count = plates.length;
  const cur = Math.min(idx, Math.max(0, count - 1));

  const platesRef = useRef(plates);
  platesRef.current = plates;
  const curRef = useRef(cur);
  curRef.current = cur;

  const setDone = useCallback((id: string, info: DoneInfo | null) => {
    setDoneMap((m) => {
      const next = { ...m };
      if (info) next[id] = info;
      else delete next[id];
      return next;
    });
    if (!info) return;
    // After a confirm, move on to the next open plate (unless the person already moved).
    const list = platesRef.current;
    const at = list.findIndex((p) => p.id === id);
    if (at < 0 || at !== curRef.current) return;
    const nextOpen = list.findIndex((p, i) => i > at && !p.done);
    if (nextOpen > -1)
      window.setTimeout(
        () => setIdx(nextOpen),
        prefersReducedMotion() ? 0 : 700,
      );
  }, []);

  /* ---------- «Más adelante» ---------- */
  const laterCards: InsCard[] = [];
  for (const lv of levers) {
    if (shownPlanIds.has(lv.representativeId)) continue;
    const rec = recById.get(lv.representativeId);
    if (rec) laterCards.push(makeCard(rec));
  }
  for (const rec of recommendations) {
    if (shownPlanIds.has(rec.id) || leverMemberSet.has(rec.id)) continue;
    laterCards.push(cardFromRec(rec));
  }

  const groups: CardGroup[] = groupCards(laterCards);
  const visibleGroups = lever ? groups.filter((g) => g.key === lever) : groups;
  const groupPoints = googleInPlan
    ? (jointPointsByTypeWithGoogle ?? jointPointsByType)
    : jointPointsByType;
  const shownPlanPoints = googleInPlan ? planPointsWithGoogle : planPoints;
  const summary = planSummary(shownPlanPoints, googlePlan, shownPlan.length);

  // A lever that no longer has cards (marked done) stops filtering.
  useEffect(() => {
    if (lever && !groups.some((g) => g.key === lever)) setLever(null);
  }, [lever, groups]);

  function jumpToLater(tab: "pend" | "res") {
    setLtab(tab);
    window.requestAnimationFrame(() =>
      laterRef.current?.scrollIntoView({
        block: "start",
        behavior: prefersReducedMotion() ? "auto" : "smooth",
      }),
    );
  }

  const totalLater = laterCards.length;
  const hasPlan = shownPlan.length > 0 || googlePlate !== null;

  return (
    <RecsContext.Provider value={{ projectId, done, setDone }}>
      <GooglePlanReport.Provider value={reportGooglePlan}>
        {hasPlan ? (
          <>
            <div className="focus-h">
              <h2>
                Tus acciones de esta semana.
                {summary ? (
                  <>
                    {" "}
                    <b>{summary}</b>
                  </>
                ) : null}
              </h2>
              <div className="ctl">
                <span className="rc-keys">← →</span>
                <button
                  type="button"
                  className="navb"
                  aria-label="Acción anterior"
                  disabled={cur === 0}
                  onClick={() => setIdx(cur - 1)}
                >
                  <Ic n="chevl" />
                </button>
                <button
                  type="button"
                  className="navb"
                  aria-label="Acción siguiente"
                  disabled={cur >= count - 1}
                  onClick={() => setIdx(cur + 1)}
                >
                  <Ic n="chevr" />
                </button>
              </div>
            </div>
            <ProgressTicks plates={plates} idx={cur} onGo={setIdx} />
            <Deck
              plates={plates}
              idx={cur}
              onIdx={setIdx}
              label="Plan de la semana"
              lastLabel="Ver el resto"
              equal
              onLast={() => jumpToLater("pend")}
            />
          </>
        ) : null}
        {/* Without a card to sit in, the slot still mounts so Google can report. */}
        {googleConnected && googlePlanSlot && !googlePlate ? (
          <div hidden>{googlePlanSlot}</div>
        ) : null}

        <div className="later-top" ref={laterRef} id="later">
          <h2>
            Más adelante<small className="num">{totalLater}</small>
          </h2>
          <Seg
            label="Más adelante"
            options={[
              ["pend", "Pendientes"],
              ["res", "Resueltas"],
            ]}
            value={ltab}
            onChange={(next) => {
              setLtab(next);
              setRow(null);
            }}
          />
        </div>

        <div className={`lgrid${ltab === "pend" ? "" : " one"}`}>
          {ltab === "pend" ? (
            <aside className="levers">
              <nav className="lidx" aria-label="Palancas">
                <div className="lidx-h">Palancas</div>
                <LeverOption
                  label="Todas"
                  n={laterCards.length}
                  pressed={lever === null}
                  onClick={() => setLever(null)}
                />
                {groups.map((g) => {
                  const pt = groupPoints?.[g.key];
                  return (
                    <LeverOption
                      key={g.key}
                      label={g.label}
                      n={g.items.length}
                      pt={
                        typeof pt === "number" && pt >= MIN_VISIBLE_POINTS
                          ? pt
                          : null
                      }
                      pressed={lever === g.key}
                      onClick={() => {
                        setLever((cur2) => (cur2 === g.key ? null : g.key));
                        setRow(null);
                      }}
                    />
                  );
                })}
                <p className="lidx-f">
                  Los puntos son lo máximo que puede sumar cada palanca.
                </p>
              </nav>
              <label className="lsel">
                <span>Palanca</span>
                <select
                  aria-label="Palanca"
                  value={lever ?? ""}
                  onChange={(e) => {
                    setLever(e.target.value || null);
                    setRow(null);
                  }}
                >
                  <option value="">Todas ({laterCards.length})</option>
                  {groups.map((g) => (
                    <option key={g.key} value={g.key}>
                      {g.label} ({g.items.length})
                    </option>
                  ))}
                </select>
                <Ic n="chevd" sm className="i" />
              </label>
            </aside>
          ) : null}
          <div className="laterb">
            {ltab === "pend" ? (
              <>
                {googleLaterSlot ? (
                  <div className="rc-google">{googleLaterSlot}</div>
                ) : null}
                {visibleGroups.length === 0 ? (
                  <div className="empty-s">
                    {laterCards.length === 0 ? (
                      <>
                        {hasPlan
                          ? "Nada más por ahora. Empieza por tu plan de esta semana."
                          : "Nada que corregir ahora mismo."}
                        {resolvedHistory.length > 0 ? (
                          <div style={{ marginTop: 12 }}>
                            <button
                              type="button"
                              className="btn sm line"
                              onClick={() => setLtab("res")}
                            >
                              Ver Resueltas
                            </button>
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <>
                        Nada con estos filtros.
                        <div style={{ marginTop: 12 }}>
                          <button
                            type="button"
                            className="btn sm line"
                            onClick={() => {
                              setLever(null);
                            }}
                          >
                            Quitar filtros
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  visibleGroups.map((g) => {
                    const expanded =
                      more[g.key] ||
                      lever === g.key ||
                      g.items.length <= GROUP_SHOW + 1;
                    const shown = expanded
                      ? g.items
                      : g.items.slice(0, GROUP_SHOW);
                    const pt = groupPoints?.[g.key];
                    const hasPt =
                      typeof pt === "number" && pt >= MIN_VISIBLE_POINTS;
                    return (
                      <section className="grp" key={g.key} aria-label={g.label}>
                        <div className="grp-h">
                          <h3>{g.label}</h3>
                          <span className="ct num">
                            {g.items.length}{" "}
                            {g.items.length === 1 ? "acción" : "acciones"}
                          </span>
                          {hasPt ? (
                            <span className="im num">
                              Hasta +{formatPoints(pt as number)} pt
                            </span>
                          ) : (
                            <span className="im num q">
                              {g.items[0].impactWord}
                            </span>
                          )}
                        </div>
                        {lever === g.key || !g.description ? null : (
                          <p className="grp-d">{g.description}</p>
                        )}
                        {shown.map((card) => (
                          <LaterRow
                            key={card.id}
                            card={card}
                            q=""
                            open={row === card.id}
                            onToggle={() =>
                              setRow((cur2) =>
                                cur2 === card.id ? null : card.id,
                              )
                            }
                          />
                        ))}
                        {g.items.length > GROUP_SHOW + 1 &&
                        lever !== g.key ? (
                          <button
                            type="button"
                            className="more"
                            aria-expanded={Boolean(more[g.key])}
                            onClick={() =>
                              setMore((m) => ({ ...m, [g.key]: !m[g.key] }))
                            }
                          >
                            {more[g.key]
                              ? "Ver menos"
                              : `Ver ${g.items.length - GROUP_SHOW} más`}
                            <Ic n="chevd" sm />
                          </button>
                        ) : null}
                      </section>
                    );
                  })
                )}
              </>
            ) : resolvedHistory.length > 0 ? (
              resolvedHistory.map((item) => (
                <ResolvedRow
                  key={item.id}
                  item={item}
                  projectId={projectId}
                  latestCompletedRunId={latestCompletedRunId}
                />
              ))
            ) : (
              <div className="empty-s">
                Todavía no hay nada resuelto. Aquí aparecerá lo que un escaneo
                confirme como resuelto y lo que marques como hecho.
              </div>
            )}
          </div>
        </div>

      </GooglePlanReport.Provider>
    </RecsContext.Provider>
  );
}

function LeverOption({
  label,
  n,
  pt,
  pressed,
  onClick,
}: {
  label: string;
  n: number;
  pt?: number | null;
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="lix"
      aria-pressed={pressed}
      disabled={n === 0}
      onClick={onClick}
    >
      <span className="nm">{label}</span>
      {pt ? <span className="p num">+{formatPoints(pt)}</span> : <span />}
      <span className="c num">{n}</span>
    </button>
  );
}
