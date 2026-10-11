"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import type { GooglePlanRec } from "./google-rec-copy";
import { planCopy } from "./google-rec-copy";
import { HandledNote, useGoogleRecMark } from "./google-rec-frame";

/**
 * The Google card inside «Tu plan de esta semana» (RECS-ONE-QUEUE-1, log §306,
 * design in docs/design-reference/recs-one-queue-1/). Same shell as an AI plan
 * card (`RecCard` with `priorityRank`), so the queue reads as one list; it keeps
 * its own scale (its place in Google, never GEO points) and its own two
 * actions, «Marcar como hecho» and «Ahora no» (log §294).
 */
export function GooglePlanCard({
  rec,
  projectId,
  rank,
  canPersist
}: {
  rec: GooglePlanRec;
  projectId: string;
  rank: number;
  canPersist: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { handled, error, pending, mark, undo } = useGoogleRecMark({
    projectId,
    kind: rec.kind,
    query: rec.query,
    position: rec.position,
    impressions: rec.impressions,
    ctr: rec.kind === "improve_snippet" ? rec.ctr : null
  });
  const copy = planCopy(rec);

  if (handled) {
    return (
      <div className="rec-card rec2-priority rec2-gcard-handled">
        <HandledNote handled={handled} pending={pending} onUndo={undo} />
        {error && (
          <p className="grec-status grec-status-error" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  const toggle = () => setOpen((o) => !o);

  return (
    <div className={`rec-card rec2-priority${open ? " open" : ""}`}>
      <div
        className="rec-main"
        onClick={toggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
        aria-expanded={open}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
            <span className="rec2-rank">{rank}</span>
            <span className="rec2-src rec2-src-g"><Icon name="search" size={11} />Google</span>
            <span className="rec2-kind">{copy.kind}</span>
          </div>
          <div className="rec-title">{copy.title}</div>
          <div className="rec2-step">
            <Icon name="arrRight" size={13} />
            <span>
              <b>Haz esto.</b> {copy.step}
            </span>
          </div>
          <div className="rec2-reach">
            <span className="rec2-reach-g" aria-hidden="true">
              <span className="rec2-gdot" title="Google">
                G
              </span>
            </span>
            <span>{copy.scope}</span>
          </div>
        </div>

        <div
          className="rec-side"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 10,
            flexShrink: 0
          }}
        >
          <div style={{ textAlign: "right" }}>
            <div className="rec2-pts" style={{ color: "var(--ink)" }}>
              {copy.metric}
            </div>
            <div className="rec2-pts-l">{copy.metricLabel}</div>
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={(e) => {
              e.stopPropagation();
              toggle();
            }}
          >
            {open ? "Ocultar" : "Ver cómo"}
            <Icon name={open ? "chevDown" : "chevRight"} size={14} />
          </button>
        </div>
      </div>

      <div className="rec-detail">
        <div className="rec-detail-inner">
          <div className="rec2-why">
            <div className="rec2-why-box">
              <div className="rec2-why-h">
                <span className="rec2-label">Lo que vimos</span>
                <span className="rec2-chip rec2-chip-strong">Dato de Google</span>
              </div>
              <p className="rec2-why-p">{copy.seen}</p>
              <div className="rec2-why-note">De tu Search Console, últimos 28 días.</div>
            </div>
            <div className="rec2-why-box">
              <div className="rec2-why-h">
                <span className="rec2-label">Por qué funciona</span>
                <span className="rec2-chip rec2-chip-advice">Lo controlas tú</span>
              </div>
              <p className="rec2-why-p">{copy.why}</p>
            </div>
          </div>

          <div className="rec2-block">
            <div className="rec2-label">La búsqueda</div>
            <ul className="rec2-qs">
              <li className="rec2-q">
                <div className="rec2-q-t">
                  <span className="rec2-gdot" aria-hidden="true">
                    G
                  </span>
                  {rec.query}
                </div>
                <div className="rec2-q-m">{copy.queryMeta}</div>
              </li>
            </ul>
          </div>

          <div className="rec2-block">
            <div className="rec2-label">Cómo hacerlo</div>
            <ol className="rec2-howto">
              {copy.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>

          <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {canPersist && (
              <>
                <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => mark("done")}>
                  <Icon name="check" size={13} />
                  Marcar como hecho
                </button>
                <button type="button" className="grec-quiet" disabled={pending} onClick={() => mark("dismissed")}>
                  Ahora no
                </button>
              </>
            )}
            <p style={{ margin: 0, fontSize: 11.5, color: "var(--ink-4)" }}>{copy.after}</p>
          </div>
          {error && (
            <p className="grec-status grec-status-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
