"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ic } from "@/components/ins/ic";
import { Bar } from "@/components/ins/kit/bar";
import { EngineLogo, engineName } from "@/components/ins/kit/engine";
import { Seg } from "@/components/ins/kit/seg";
import { Sheet, SheetHead } from "@/components/ins/kit/sheet";
import { useToast } from "@/components/ins/toasts";
import { FormattedResponse } from "@/components/ui/formatted-response";
import { deactivatePrompt } from "@/app/dashboard/projects/[projectId]/actions";
import { mentionLine, type SummaryCitation } from "@/components/prompts/engine-summary";
import { buildPromptDetail, citationLabel, type DetailRow } from "@/lib/ins/prompt-detail";
import { sentimentClass, sentimentText } from "./sentiment";

/**
 * Detail of one prompt (CONSOLE-INSTRUMENTO-1 F5, log §360): the approved
 * side sheet with «Resumen» and «Respuestas». Every figure is a count of the
 * stored answers (see `lib/ins/prompt-detail.ts`).
 */

type Tab = "res" | "ans";

const SOURCES_SHOWN = 6;

/** Monogram where the prototype draws a brand favicon: we have the name, not a mark. */
function Mono({ name, xs }: { name: string; xs?: boolean }) {
  return (
    <span className={`fav mono-f${xs ? " xs" : ""}`} aria-hidden="true">
      {name.trim().slice(0, 1).toUpperCase() || "·"}
    </span>
  );
}

type MergedSource = { citation: SummaryCitation; isOwn: boolean; providers: string[]; answers: number };

export function PromptSheet({
  projectId,
  projectDomain,
  projectBrand,
  competitors,
  promptId,
  text,
  category,
  rows,
  pending,
  onClose,
}: {
  projectId: string;
  projectDomain: string;
  projectBrand: string;
  competitors: Array<{ name: string }>;
  promptId: string | null;
  text: string;
  category: string | null;
  rows: DetailRow[];
  pending: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("res");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, startDelete] = useTransition();
  const [showAllRanking, setShowAllRanking] = useState(false);
  const [showAllSources, setShowAllSources] = useState(false);
  const [engineIdx, setEngineIdx] = useState(0);
  const [answerIdx, setAnswerIdx] = useState(0);

  const detail = useMemo(
    () => (rows.length ? buildPromptDetail({ rows, projectDomain, projectBrand, competitors }) : null),
    [rows, projectDomain, projectBrand, competitors],
  );

  const sources = useMemo<MergedSource[]>(() => {
    if (!detail) return [];
    const merged = new Map<string, MergedSource>();
    for (const e of detail.engines) {
      for (const s of e.summary.sources) {
        const key = citationLabel(s.citation).toLowerCase();
        const entry = merged.get(key);
        if (entry) {
          entry.providers.push(e.provider);
          entry.answers += s.answers;
        } else {
          merged.set(key, { citation: s.citation, isOwn: s.isOwn, providers: [e.provider], answers: s.answers });
        }
      }
    }
    return [...merged.values()].sort((a, b) => {
      if (a.isOwn !== b.isOwn) return a.isOwn ? -1 : 1;
      if (b.providers.length !== a.providers.length) return b.providers.length - a.providers.length;
      return b.answers - a.answers;
    });
  }, [detail]);

  function remove() {
    if (!promptId) return;
    startDelete(async () => {
      const form = new FormData();
      form.set("projectId", projectId);
      form.set("promptId", promptId);
      await deactivatePrompt(form);
      onClose();
      router.refresh();
      toast("Prompt borrado.", "Dejará de incluirse en los próximos escaneos.", "checkc");
    });
  }

  const deleteControl = !promptId ? null : confirmDelete ? (
    <span className="inl">
      ¿Borrarlo para siempre?
      <button type="button" className="btn ink sm" onClick={remove} disabled={deleting}>
        {deleting ? "Borrando…" : "Sí, borrar"}
      </button>
      <button type="button" className="btn ghost sm" onClick={() => setConfirmDelete(false)} disabled={deleting}>
        No
      </button>
    </span>
  ) : (
    <button type="button" className="btn sm ghost" onClick={() => setConfirmDelete(true)}>
      Borrar prompt
    </button>
  );

  const head = (
    <SheetHead
      title={text}
      kicker={category ? <span className="badge b-line">{category}</span> : null}
      extra={deleteControl}
      onClose={onClose}
    />
  );

  if (pending || !detail) {
    return (
      <Sheet label="Detalle del prompt" onClose={onClose}>
        {head}
        <div className="psh-b">
          <div className="empty-s" style={{ textAlign: "left", padding: "8px 0" }}>
            Todavía no se ha escaneado. Verás sus respuestas tras tu próximo escaneo.
          </div>
        </div>
      </Sheet>
    );
  }

  const eng = detail.engines[Math.min(engineIdx, detail.engines.length - 1)];
  const answer = eng.answers[Math.min(answerIdx, eng.answers.length - 1)];
  const rankingMentioned = detail.ranking.filter((r) => r.mentioned).length;
  const visibleRanking = detail.ranking.filter((r) => r.isOwn || r.mentioned || showAllRanking);
  const hiddenRanking = detail.ranking.length - visibleRanking.length;
  const shownSources = showAllSources ? sources : sources.slice(0, SOURCES_SHOWN);
  const noWebEngines = detail.engines.filter((e) => e.summary.sources.length === 0);

  return (
    <Sheet label="Detalle del prompt" onClose={onClose}>
      {head}
      <div className="psh-tabs">
        <Seg
          label="Vista del prompt"
          value={tab}
          onChange={(t) => {
            setTab(t);
            setAnswerIdx(0);
          }}
          options={[
            ["res", "Resumen"],
            ["ans", "Respuestas"],
          ]}
        />
      </div>
      <div className="psh-b">
        {tab === "res" ? (
          <>
            <div className="prd-sig">
              <div className={detail.mentioned ? "ok" : ""}>
                <div className="l">Te nombra en</div>
                <div className="v num">
                  {detail.mentionedAnswers}
                  <small> de {detail.totalAnswers} {detail.totalAnswers === 1 ? "respuesta" : "respuestas"}</small>
                </div>
              </div>
              <div className={detail.ownCited ? "ok" : ""}>
                <div className="l">Cita tu web en</div>
                <div className="v num">
                  {detail.ownCitedAnswers}
                  <small> de {detail.totalAnswers} {detail.totalAnswers === 1 ? "respuesta" : "respuestas"}</small>
                </div>
              </div>
            </div>

            <div className="prd-sec">
              <div className="eyebrow">Por motor</div>
              {detail.sameAnswerCount !== null && detail.sameAnswerCount > 1 ? (
                <p className="prd-n" style={{ marginTop: 0 }}>
                  Cada motor respondió {detail.sameAnswerCount} veces en este escaneo
                </p>
              ) : null}
              {detail.engines.map((e) => {
                const s = e.summary;
                const noWeb = s.sources.length === 0 && s.ownCited === 0;
                return (
                  <div className="prd-eng" key={e.provider}>
                    <div className="h">
                      <EngineLogo provider={e.provider} size={16} />
                      <b>{e.label}</b>
                      {s.mentioned > 0 && s.sentiment ? (
                        <span className={`pr-sent ${sentimentClass(s.sentiment)}`}>{sentimentText(s.sentiment)}</span>
                      ) : null}
                    </div>
                    <div className="r">
                      <span>
                        {s.answers <= 1 ? (
                          mentionLine(s)
                        ) : (
                          <>
                            Te nombra en <b className="num">{s.mentioned} de {s.answers}</b> respuestas
                          </>
                        )}
                      </span>
                      <Bar
                        value={s.mentioned}
                        max={Math.max(1, s.answers)}
                        cls={`thin${s.mentioned ? "" : " nomark"}`}
                        label={`${e.label}: te nombra en ${s.mentioned} de ${s.answers}`}
                      />
                    </div>
                    <div className="r">
                      <span>
                        {noWeb ? (
                          "Respondió sin buscar en la web"
                        ) : s.answers <= 1 ? (
                          s.ownCited > 0 ? "Cita tu web" : "No cita tu web"
                        ) : (
                          <>
                            Cita tu web en <b className="num">{s.ownCited} de {s.answers}</b> respuestas
                          </>
                        )}
                      </span>
                      {noWeb ? (
                        <i />
                      ) : (
                        <Bar value={s.ownCited} max={Math.max(1, s.answers)} cls={`thin ink${s.ownCited ? "" : " nomark"}`} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="prd-sec">
              <div className="eyebrow">Marcas en estas respuestas</div>
              <p className="prd-n" style={{ marginTop: 0 }}>
                {rankingMentioned} de {detail.ranking.length} marcas nombradas en este prompt.
              </p>
              {visibleRanking.map((r, i) => (
                <div className={`prd-rk${r.isOwn ? " me" : ""}`} key={r.name}>
                  <span className="num pos">{String(i + 1).padStart(2, "0")}</span>
                  <Mono name={r.name} xs />
                  <b>{r.name}</b>
                  {r.isOwn ? <span className="you">Tú</span> : <span />}
                  <span className="num v">
                    {r.coverage === null ? (
                      "—"
                    ) : (
                      <>
                        {r.mentionCount}
                        <small> de {r.evaluatedCount}</small>
                      </>
                    )}
                  </span>
                  <Bar
                    value={r.mentionCount}
                    max={Math.max(1, r.evaluatedCount)}
                    cls={`thin${r.isOwn ? "" : " ink"}${r.mentioned ? "" : " nomark"}`}
                    label={
                      r.coverage === null
                        ? `${r.name}: ninguna respuesta llegó a evaluarla`
                        : `${r.name}: nombrada en ${r.mentionCount} de ${r.evaluatedCount}`
                    }
                  />
                </div>
              ))}
              {hiddenRanking > 0 ? (
                <button type="button" className="btn ghost sm" onClick={() => setShowAllRanking(true)}>
                  Ver {hiddenRanking} {hiddenRanking === 1 ? "marca más sin mención" : "marcas más sin mención"}
                </button>
              ) : null}
            </div>

            {detail.evidence.length > 0 ? (
              <div className="prd-sec">
                <div className="eyebrow">Lo que dicen de {projectBrand}</div>
                {detail.evidence.map((g) =>
                  g.evidence.length > 0 ? (
                    g.evidence.map((quote, i) => (
                      <blockquote className="prd-q" key={`${g.provider}-${i}`}>
                        <span>
                          <EngineLogo provider={g.provider} size={13} />
                          {g.label}
                          {g.aliasName ? <span className="badge b-blue">vía alias «{g.aliasName}»</span> : null}
                        </span>
                        «{quote}»
                      </blockquote>
                    ))
                  ) : (
                    <blockquote className="prd-q" key={g.provider}>
                      <span>
                        <EngineLogo provider={g.provider} size={13} />
                        {g.label}
                        {g.aliasName ? <span className="badge b-blue">vía alias «{g.aliasName}»</span> : null}
                      </span>
                      Mención verificada, pero este motor no dejó una cita textual recuperable. La respuesta
                      completa está en «Respuestas», con el nombre resaltado.
                    </blockquote>
                  ),
                )}
              </div>
            ) : null}

            {detail.hasAnySource ? (
              <div className="prd-sec">
                <div className="eyebrow">Fuentes usadas</div>
                {shownSources.map((s) => (
                  <div className="prd-src" key={citationLabel(s.citation)}>
                    <Mono name={citationLabel(s.citation).replace(/^www\./, "")} xs />
                    <span className="mono">{citationLabel(s.citation)}</span>
                    {s.isOwn ? <span className="badge b-blue">Tuya</span> : null}
                    <span className="e" aria-label={`La citan ${s.providers.map(engineName).join(", ")}`}>
                      {s.providers.map((p) => (
                        <EngineLogo key={p} provider={p} size={12} />
                      ))}
                    </span>
                  </div>
                ))}
                {sources.length > shownSources.length ? (
                  <button type="button" className="btn ghost sm" onClick={() => setShowAllSources(true)}>
                    Ver {sources.length - shownSources.length}{" "}
                    {sources.length - shownSources.length === 1 ? "fuente más" : "fuentes más"}
                  </button>
                ) : null}
                <p className="prd-n">
                  Son las páginas que la IA usó para responder, no necesariamente las que hablan de tu marca. Cada
                  una sale una vez, con los motores que la usaron.
                  {noWebEngines.length > 0
                    ? ` ${noWebEngines.map((e) => e.label).join(" y ")} ${noWebEngines.length === 1 ? "respondió" : "respondieron"} sin buscar en la web.`
                    : ""}
                  {!detail.ownCited ? ` Ninguna es ${projectDomain}, por eso no cuenta como cita tuya.` : ""}
                </p>
              </div>
            ) : null}
          </>
        ) : (
          <>
            {detail.engines.length > 1 ? (
              <div className="prd-pick">
                <Seg
                  label="Motor"
                  value={eng.provider}
                  onChange={(p) => {
                    setEngineIdx(Math.max(0, detail.engines.findIndex((e) => e.provider === p)));
                    setAnswerIdx(0);
                  }}
                  options={detail.engines.map(
                    (e) =>
                      [
                        e.provider,
                        <>
                          <EngineLogo provider={e.provider} size={13} />
                          <span>{e.label}</span>
                        </>,
                      ] as const,
                  )}
                />
              </div>
            ) : null}
            <div className="prd-ans-h">
              <span className="num">
                Respuesta {Math.min(answerIdx, eng.answers.length - 1) + 1} de {eng.answers.length}
              </span>
              <span className={answer.mentioned ? "tpos" : ""}>{answer.mentioned ? "Te nombra" : "No te nombra"}</span>
              {answer.mentioned && answer.sentiment ? <span>{sentimentText(answer.sentiment)}</span> : null}
              {answer.citesOwn ? <span>Cita tu web</span> : null}
              <span>
                {answer.sources === 0 ? "Sin fuentes" : `${answer.sources} ${answer.sources === 1 ? "fuente" : "fuentes"}`}
              </span>
              <span style={{ flex: 1 }} />
              {eng.answers.length > 1 ? (
                <>
                  <button
                    type="button"
                    className="navb"
                    aria-label="Respuesta anterior"
                    disabled={answerIdx <= 0}
                    onClick={() => setAnswerIdx((i) => Math.max(0, i - 1))}
                  >
                    <Ic n="chevl" />
                  </button>
                  <button
                    type="button"
                    className="navb"
                    aria-label="Respuesta siguiente"
                    disabled={answerIdx >= eng.answers.length - 1}
                    onClick={() => setAnswerIdx((i) => Math.min(eng.answers.length - 1, i + 1))}
                  >
                    <Ic n="chevr" />
                  </button>
                </>
              ) : null}
            </div>
            <div className="prd-ans">
              {answer.row.raw_response_text ? (
                <FormattedResponse text={answer.row.raw_response_text} brand={projectBrand} />
              ) : (
                <p style={{ color: "var(--ink-3)" }}>El texto de esta respuesta no se guardó.</p>
              )}
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
