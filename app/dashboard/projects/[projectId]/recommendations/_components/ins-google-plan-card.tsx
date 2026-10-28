"use client";

import { useState } from "react";
import { Ic } from "@/components/ins/ic";
import { NextButton, useDeckPlate } from "@/components/ins/kit/deck";
import { SlideToConfirm } from "@/components/ins/kit/slide";
import { SrcChip } from "@/components/ins/recs/card-parts";
import type { GooglePlanRec } from "./google-rec-copy";
import { planCopy } from "./google-rec-copy";
import { useGoogleRecMark } from "./google-rec-frame";

/**
 * The Google plate of «Tu plan de esta semana» in the «Instrumento» deck
 * (CONSOLE-INSTRUMENTO-1 F4, log §357). Same content as `GooglePlanCard`
 * (RECS-ONE-QUEUE-1, log §307): its own scale (its place in Google, never GEO
 * points) and its own two actions, «Marcar como hecho» and «Ahora no»
 * (log §294), which only exist when the state can be saved.
 */
export function InsGooglePlanCard({
  rec,
  projectId,
  canPersist,
}: {
  rec: GooglePlanRec;
  projectId: string;
  canPersist: boolean;
}) {
  const plate = useDeckPlate();
  const [how, setHow] = useState(false);
  const [why, setWhy] = useState(false);
  const { handled, error, pending, mark, undo } = useGoogleRecMark({
    projectId,
    kind: rec.kind,
    query: rec.query,
    position: rec.position,
    impressions: rec.impressions,
    ctr: rec.kind === "improve_snippet" ? rec.ctr : null,
  });
  const copy = planCopy(rec);
  const index = plate?.index ?? 0;

  return (
    <div className="in">
      <div className="dk-top">
        <span className="dk-ix num" aria-hidden="true">
          {String(index + 1).padStart(2, "0")}
        </span>
        <div className="dk-ch">
          <SrcChip src="google" />
          <span className="k">{copy.kind}</span>
        </div>
        <div className="dk-imp">
          <div className="v num">{copy.metric}</div>
          <div className="t">{copy.metricLabel}</div>
        </div>
      </div>
      <div className="do-k">Haz esto</div>
      <h3 className="do">{copy.title}</h3>
      <p className="why">{copy.step}</p>
      <p className="eng-l">{copy.scope}</p>
      <div className={`seen${how ? " open" : ""}`}>
        <button
          type="button"
          aria-expanded={how}
          onClick={() => setHow((o) => !o)}
        >
          <span>Cómo hacerlo</span>
          <Ic n="chevd" sm />
        </button>
        {how ? (
          <ol className="rc-howto">
            {copy.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        ) : null}
      </div>
      <div className={`seen${why ? " open" : ""}`}>
        <button
          type="button"
          aria-expanded={why}
          onClick={() => setWhy((o) => !o)}
        >
          <span>Lo que vimos y por qué funciona</span>
          <Ic n="chevd" sm />
        </button>
        {why ? (
          <div className="rc-detail">
            <div>
              <div className="lbl">
                Lo que vimos{" "}
                <span className="rc-chip strong">Dato de Google</span>
              </div>
              <p>{copy.seen}</p>
              <p className="rc-sub">De tu Search Console, últimos 28 días.</p>
            </div>
            <div>
              <div className="lbl">
                Por qué funciona{" "}
                <span className="rc-chip advice">Lo controlas tú</span>
              </div>
              <p>{copy.why}</p>
            </div>
            <div>
              <div className="lbl">La búsqueda</div>
              <ul className="rc-qs">
                <li>
                  <span className="g">
                    <svg
                      width="13"
                      height="13"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <use href="#e-google" />
                    </svg>
                  </span>
                  <span>
                    {rec.query}
                    <span className="rc-sub"> · {copy.queryMeta}</span>
                  </span>
                </li>
              </ul>
            </div>
          </div>
        ) : null}
      </div>
      {error ? (
        <p className="rc-err" role="alert">
          {error}
        </p>
      ) : null}
      <div className="dk-act">
        {handled ? (
          <div className="donebar" role="status">
            <Ic n="checkc" />
            {handled === "done"
              ? "Marcada como hecha."
              : "La dejamos para más adelante."}
            <button
              type="button"
              className="btn sm ghost"
              disabled={pending}
              onClick={undo}
            >
              <Ic n="undo" sm />
              Deshacer
            </button>
          </div>
        ) : canPersist ? (
          <>
            <SlideToConfirm
              key={error ? "err" : "ok"}
              onConfirm={() => mark("done")}
              disabled={pending}
            />
            <button
              type="button"
              className="btn ghost"
              disabled={pending}
              onClick={() => mark("dismissed")}
            >
              Ahora no
            </button>
          </>
        ) : null}
        <NextButton />
      </div>
      <p className="hint2">
        {handled
          ? "La próxima vez que entres verás otra en su lugar."
          : copy.after}
      </p>
    </div>
  );
}
