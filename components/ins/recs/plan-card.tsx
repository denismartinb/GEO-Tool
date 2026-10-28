"use client";

import { useState } from "react";
import { Ic } from "@/components/ins/ic";
import { NextButton, useDeckPlate } from "@/components/ins/kit/deck";
import { SlideToConfirm } from "@/components/ins/kit/slide";
import { formatPoints } from "@/lib/recommendations/plan";
import { importanceLabel, type InsCard } from "@/lib/ins/recs-cards";
import { EmergingAction, useCardActions } from "./actions";
import {
  CardBadges,
  CardDetail,
  EngineRow,
  GeneratingBlock,
  SeenAccordion,
  SolutionBlock,
  SrcChip,
  TitleWithPath,
} from "./card-parts";

const pad = (n: number) => String(n).padStart(2, "0");

export function Importance({ card }: { card: InsCard }) {
  if (card.points === null) {
    return (
      <div className="dk-imp">
        <div className="w">{card.impactWord}</div>
        <div className="t">sin cifra calculable</div>
      </div>
    );
  }
  return (
    <div className="dk-imp">
      <div className="v num">
        {card.pointsUpTo ? <span className="rc-upto">hasta </span> : null}+
        {formatPoints(card.points)}
        <small>pt</small>
      </div>
      <div className="t">
        {card.pointsCaption === "potenciales" || !card.pointsCaption
          ? "Puntuación GEO"
          : `Puntuación GEO, ${card.pointsCaption}`}
      </div>
    </div>
  );
}

/** One plate of «Tu plan de esta semana» (and of the focus layer). */
export function PlanCard({ card }: { card: InsCard }) {
  const plate = useDeckPlate();
  const index = plate?.index ?? 0;
  const a = useCardActions(card);
  const [detail, setDetail] = useState(false);
  const emerging = card.form === "emerging";

  return (
    <div className="in">
      <div className="dk-top">
        <span className="dk-ix num" aria-hidden="true">
          {pad(index + 1)}
        </span>
        <div className="dk-ch">
          <SrcChip src="ia" />
          <span className="k">{card.kindLabel}</span>
          <CardBadges card={card} />
        </div>
        {emerging ? null : <Importance card={card} />}
      </div>
      <div className="do-k">Haz esto</div>
      <h3 className="do">
        <TitleWithPath text={card.title} />
      </h3>
      {card.context && !emerging ? <p className="rc-ctx">{card.context}</p> : null}
      {card.step ? <p className="why">{card.step}</p> : null}
      {emerging && card.reach ? (
        <p className="eng-l">
          <EngineRow providers={card.providers} size={13} />
          {card.reach}
        </p>
      ) : null}
      {!emerging && card.questions.length > 0 ? (
        <SeenAccordion card={card} />
      ) : null}
      {!emerging && card.questions.length === 0 && card.reach ? (
        <p className="eng-l">{card.reach}</p>
      ) : null}
      {!emerging ? (
        <div className={`seen${detail ? " open" : ""}`}>
          <button
            type="button"
            aria-expanded={detail}
            onClick={() => setDetail((o) => !o)}
          >
            <span>Lo que vimos y por qué funciona</span>
            <Ic n="chevd" sm />
          </button>
          {detail ? <CardDetail card={card} withQuestions={false} /> : null}
        </div>
      ) : null}
      {a.generating ? <GeneratingBlock /> : null}
      {!a.generating && card.solution ? (
        <SolutionBlock solution={card.solution} type={card.type} />
      ) : null}
      {a.generateError ? (
        <p className="rc-err" role="alert">
          {a.generateError}
        </p>
      ) : null}
      {a.markError ? (
        <p className="rc-err" role="alert">
          {a.markError}
        </p>
      ) : null}
      <div className="dk-act">
        {emerging ? (
          <EmergingAction card={card} />
        ) : a.done ? (
          <div className="donebar" role="status">
            <Ic n="checkc" />
            {a.done.message}
            <button
              type="button"
              className="btn sm ghost"
              disabled={a.undoing}
              onClick={a.undoDone}
            >
              <Ic n="undo" sm />
              Deshacer
            </button>
          </div>
        ) : (
          <>
            <SlideToConfirm
              key={a.markError ? "err" : "ok"}
              onConfirm={a.markDone}
              disabled={a.marking}
            />
            {card.solution ? null : (
              <button
                type="button"
                className="btn line"
                disabled={a.generating}
                onClick={a.generate}
              >
                <Ic n="sparkles" sm />
                {a.cta}
              </button>
            )}
          </>
        )}
        <NextButton />
      </div>
      {a.done ? (
        <p className="hint2">{a.done.hint}</p>
      ) : card.control === "third_party" && !emerging ? (
        <p className="hint2">Verás si te incluyen en tu próximo escaneo.</p>
      ) : null}
      {a.undoError ? (
        <p className="rc-err" role="alert">
          {a.undoError}
        </p>
      ) : null}
    </div>
  );
}
