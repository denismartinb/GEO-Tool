"use client";

import { useState, type ReactNode } from "react";
import { Ic } from "@/components/ins/ic";
import { foldText, importanceLabel, type InsCard } from "@/lib/ins/recs-cards";
import { enginesLine } from "./engines-line";
import { EmergingAction, useCardActions } from "./actions";
import { CardDetail, GeneratingBlock, SolutionBlock } from "./card-parts";

/** Wraps every occurrence of `q` (accent- and case-insensitive) in `<mark>`. */
export function markText(text: string, q: string): ReactNode {
  const needle = foldText(q.trim());
  if (!needle) return text;
  const folded = foldText(text);
  const out: ReactNode[] = [];
  let at = 0;
  let from = 0;
  let hit = folded.indexOf(needle, from);
  // `fold` keeps one character per character (accents are stripped, never merged), so offsets line up.
  if (folded.length !== text.length) return text;
  while (hit > -1) {
    out.push(
      text.slice(at, hit),
      <mark key={hit}>{text.slice(hit, hit + needle.length)}</mark>,
    );
    at = hit + needle.length;
    from = at;
    hit = folded.indexOf(needle, from);
  }
  out.push(text.slice(at));
  return <>{out}</>;
}

/** `/ruta` fragments in the code style of the prototype, with the search marked inside. */
export function MarkedPath({ text, q }: { text: string; q: string }) {
  const parts = text.split(/(^|[\s«(])(\/[a-z0-9][a-z0-9\-/.]*[a-z0-9])/g);
  const out: ReactNode[] = [];
  for (let i = 0; i < parts.length; i += 3) {
    out.push(<span key={`t${i}`}>{markText(parts[i], q)}</span>);
    if (parts[i + 1] !== undefined)
      out.push(<span key={`s${i}`}>{parts[i + 1]}</span>);
    if (parts[i + 2] !== undefined) {
      out.push(
        <code key={`c${i}`} className="p">
          {markText(parts[i + 2], q)}
        </code>,
      );
    }
  }
  return <>{out}</>;
}

export function LaterRow({
  card,
  q,
  open,
  onToggle,
}: {
  card: InsCard;
  q: string;
  open: boolean;
  onToggle: () => void;
}) {
  const a = useCardActions(card);
  const [inline, setInline] = useState(false);
  const [showSol, setShowSol] = useState(false);
  const emerging = card.form === "emerging";
  const imp = importanceLabel(card);
  const line = card.step ?? card.context ?? card.reach ?? "";

  return (
    <div className={`lrow${open ? " open" : ""}`}>
      <button type="button" aria-expanded={open} onClick={onToggle}>
        <span className="tt">
          <span className="ch lq">
            <span className="pv-src ia">IA</span>
            {card.control === "third_party" ? (
              <span className="tx">Depende de terceros</span>
            ) : null}
            {card.quick ? <span className="tx">Victoria rápida</span> : null}
            <span className="im-m num">· {imp}</span>
          </span>
          <b>
            <MarkedPath text={card.title} q={q} />
          </b>
          {line ? <span className="w">{markText(line, q)}</span> : null}
        </span>
        <span className={`im num${card.points !== null ? "" : " lo"}`}>
          {imp}
        </span>
        <Ic n="chevd" sm />
      </button>
      {open ? (
        <div className="ex">
          {card.providers.length > 0 || card.questions.length > 0 ? (
            <p className="eng-l">{enginesLine(card)}</p>
          ) : null}
          {card.context && card.step ? (
            <p className="rc-ctx">{card.context}</p>
          ) : null}
          <CardDetail card={card} />
          {a.generating ? <GeneratingBlock /> : null}
          {!a.generating && card.solution && showSol ? (
            <SolutionBlock solution={card.solution} type={card.type} />
          ) : null}
          {a.generateError || a.markError ? (
            <p className="rc-err" role="alert">
              {a.generateError ?? a.markError}
            </p>
          ) : null}
          <div className="acts">
            {emerging ? (
              <EmergingAction card={card} />
            ) : (
              <>
                <button
                  type="button"
                  className="btn line sm"
                  disabled={a.generating}
                  aria-expanded={card.solution ? showSol : undefined}
                  onClick={() => {
                    if (card.solution) setShowSol((o) => !o);
                    else {
                      setShowSol(true);
                      a.generate();
                    }
                  }}
                >
                  <Ic n="sparkles" sm />
                  {card.solution && showSol ? "Ocultar propuesta" : a.cta}
                </button>
                {inline ? (
                  <span className="inl">
                    ¿Marcarla como hecha?
                    <button
                      type="button"
                      className="btn ink"
                      disabled={a.marking}
                      onClick={() => {
                        a.markDone();
                        setInline(false);
                      }}
                    >
                      Sí
                    </button>
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => setInline(false)}
                    >
                      No
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="btn sm ghost"
                    disabled={a.marking}
                    onClick={() => setInline(true)}
                  >
                    <Ic n="check" sm />
                    {a.marking ? "Actualizando…" : "Marcar como hecho"}
                  </button>
                )}
              </>
            )}
          </div>
          {!emerging ? (
            <p className="hint2">
              {card.control === "third_party"
                ? "Verás si te incluyen en tu próximo escaneo."
                : card.lever && card.lever.memberIds.length > 1
                  ? "Cierra todas sus preguntas. Cada una se comprueba en tu próximo escaneo."
                  : "Lo verás en tu próximo escaneo."}
            </p>
          ) : null}
          <button type="button" className="lrow-close" onClick={onToggle}>
            Cerrar esta acción
            <Ic n="chevd" sm />
          </button>
        </div>
      ) : null}
    </div>
  );
}
