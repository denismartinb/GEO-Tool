"use client";

import { useState } from "react";
import type { TopicActionView } from "@/lib/seo-tracking/screen";
import type { weeklySummary } from "@/lib/seo-tracking/view-model";
import { fmtInt, fmtPosition } from "../format";
import { SeoRivalsModal } from "./seo-rivals-modal";
import { ActionChip, OpenChevron, PositionCell, pathOf } from "./seo-shared";
import type { ReadyData, SeoView } from "./seo-tracking";

export type TodoItem = { topicId: string; topicName: string; action: TopicActionView; openCount: number };
export type GscMini = { clicks: number; impressions: number; position: number | null; nearPage1: number };

function LinkStrip({ data, ownDomain, onRivals }: { data: ReadyData; ownDomain: string; onRivals: () => void }) {
  const own = data.own?.referringDomains ?? null;
  const measured = data.rivals.filter((r) => r.referringDomains !== null);
  const head = (
    <div className="sa-ch">
      <h3 className="skw-h-chip">
        {own !== null && measured.length > 0 && <span className="skw-chip skw-chip-neg">Lo que más te frena</span>}
        Los enlaces
      </h3>
      <button type="button" className="skw-link" onClick={onRivals}>
        {data.rivals.length ? "Cambiar rivales" : "Elegir rivales"}
      </button>
    </div>
  );
  if (!data.rivals.length) {
    return (
      <div className="card">
        {head}
        <p className="skw-p">Elige hasta {data.caps.competitors === 1 ? "un rival" : `${data.caps.competitors} rivales`} y comparamos cuántas webs os enlazan, a ellos y a ti.</p>
      </div>
    );
  }
  if (own === null || measured.length === 0) {
    return (
      <div className="card">
        {head}
        <p className="skw-p">Estamos midiendo los enlaces de {ownDomain} y de tus rivales. Salen aquí en cuanto los tengamos.</p>
      </div>
    );
  }
  const avg = Math.round(measured.reduce((a, r) => a + (r.referringDomains as number), 0) / measured.length);
  const max = Math.max(own, ...measured.map((r) => r.referringDomains as number), 1);
  const rows = [{ domain: "Tú", rd: own, me: true }, ...measured.map((r) => ({ domain: r.domain, rd: r.referringDomains as number, me: false }))];
  return (
    <div className="card">
      {head}
      <p className="skw-p">
        Te enlazan <b>{fmtInt(own)}</b> webs. A tus rivales, <b>{fmtInt(avg)}</b> de media.
        {avg >= own * 3 ? " Con tan pocos enlaces, mejorar tus páginas sólo te sube hasta cierto punto." : ""}
      </p>
      <div className="skw-linkbars">
        {rows.map((r) => (
          <div key={r.domain} className={`skw-lb${r.me ? " is-me" : ""}`}>
            <span>{r.domain}</span>
            <span className="skw-bar" aria-hidden="true">
              <i style={{ width: `${Math.max(3, (r.rd / max) * 100)}%` }} />
            </span>
            <span className="skw-n">{fmtInt(r.rd)}</span>
          </div>
        ))}
      </div>
      <p className="sa-note" style={{ marginTop: 10, marginBottom: 0 }}>
        Webs distintas que enlazan a cada dominio.
      </p>
    </div>
  );
}

export function SeoResumen(props: {
  projectId: string;
  ownDomain: string;
  data: ReadyData;
  todo: TodoItem[];
  summary: ReturnType<typeof weeklySummary>;
  gsc: GscMini | null;
  /** Keywords saved but not yet seen in Google, and whether that is taking long. */
  waiting: number;
  slow: boolean;
  onOpenTopic: (id: string, keywordId?: string) => void;
  onGo: (v: SeoView) => void;
  onToast: (m: string) => void;
}) {
  const { data, summary } = props;
  const [rivalsOpen, setRivalsOpen] = useState(false);
  const topicName = (id: string | null) => data.topics.find((t) => t.id === id)?.name ?? "";
  const firstWeek = data.latestWeek === null;

  return (
    <>
      {!firstWeek && props.todo.length > 0 && (
        <div className="card">
          <div className="sa-ch">
            <h3>Qué hacer esta semana</h3>
            <button type="button" className="skw-link" onClick={() => props.onGo("temas")}>
              Ver todos los temas
            </button>
          </div>
          <div className="skw-todo">
            {props.todo.map((t) => (
              <button key={`${t.topicId}-${t.action.key}`} type="button" onClick={() => props.onOpenTopic(t.topicId)}>
                <ActionChip type={t.action.type} />
                <span>
                  <b>{t.action.title}</b>
                  <small>
                    {t.topicName} · paso 1 de {t.openCount}
                  </small>
                </span>
                <OpenChevron />
              </button>
            ))}
          </div>
        </div>
      )}

      <LinkStrip data={data} ownDomain={props.ownDomain} onRivals={() => setRivalsOpen(true)} />

      <div className="skw-two">
        <div className="card">
          {firstWeek ? (
            <>
              <div className="sa-ch">
                <h3>Tus palabras</h3>
              </div>
              <p className="skw-notice" role="status">
                {props.slow ? (
                  <>
                    <b>La primera foto de Google está tardando más de lo normal.</b> Lo seguimos intentando solos; vuelve en un rato. Mientras tanto,
                    abajo tienes lo que ya dice tu Search Console.
                  </>
                ) : (
                  <>
                    <span className="skw-spin" aria-hidden="true" />
                    <b>Estamos tomando la primera foto de Google.</b> Revisamos el Top 20 de tus {summary.total}{" "}
                    {summary.total === 1 ? "palabra" : "palabras"}; tarda un par de minutos y la pantalla se actualiza sola. Mientras tanto, abajo tienes
                    lo que ya dice tu Search Console.
                  </>
                )}
              </p>
            </>
          ) : (
            <>
              <div className="sa-ch">
                <h3>Tus palabras esta semana</h3>
                <button type="button" className="skw-link" onClick={() => props.onGo("temas")}>
                  Ver los temas
                </button>
              </div>
              <div className="skw-minis">
                <div className="skw-mini">
                  <div className="skw-v">
                    {summary.pageOne} <span>de {summary.total}</span>
                  </div>
                  <div className="skw-l">en la página 1</div>
                </div>
                <div className="skw-mini">
                  <div className="skw-v skw-up">{summary.up}</div>
                  <div className="skw-l">han subido</div>
                </div>
                <div className="skw-mini">
                  <div className="skw-v skw-down">{summary.down}</div>
                  <div className="skw-l">han bajado</div>
                </div>
                <div className="skw-mini">
                  <div className="skw-v">{summary.outside}</div>
                  <div className="skw-l">fuera del Top 20</div>
                </div>
              </div>
              {summary.biggestMoves.length > 0 && (
                <>
                  <div className="skw-subh">Lo que más se ha movido</div>
                  {summary.biggestMoves.map((k) => (
                    <button key={k.id} type="button" className="skw-mv" onClick={() => props.onOpenTopic(k.topicId ?? "sin-tema", k.id)}>
                      <span>
                        {k.keyword}
                        <small>
                          {topicName(k.topicId) || "Sin tema"} · {pathOf(k.url)}
                        </small>
                      </span>
                      <PositionCell k={k} />
                    </button>
                  ))}
                </>
              )}
              <p className="sa-note" style={{ marginTop: 10, marginBottom: 0 }}>
                Puestos de Google España en ordenador, en la última foto. Comparados con la foto anterior.
                {props.waiting > 0 && !props.slow && ` Estamos mirando ${props.waiting === 1 ? "una palabra nueva" : `${props.waiting} palabras nuevas`}; salen en un par de minutos.`}
              </p>
            </>
          )}
        </div>

        {props.gsc && (
          <div className="card">
            <div className="sa-ch">
              <h3>Google · últimos 28 días</h3>
              <span className="sa-src">Search Console</span>
            </div>
            <div className="skw-minis skw-minis-2">
              <div className="skw-mini">
                <div className="skw-v">{fmtInt(props.gsc.clicks)}</div>
                <div className="skw-l">clics</div>
              </div>
              <div className="skw-mini">
                <div className="skw-v">{fmtInt(props.gsc.impressions)}</div>
                <div className="skw-l">impresiones</div>
              </div>
              <div className="skw-mini">
                <div className="skw-v">{props.gsc.position === null ? "—" : fmtPosition(props.gsc.position)}</div>
                <div className="skw-l">puesto medio</div>
              </div>
              <div className="skw-mini">
                <div className="skw-v">{fmtInt(props.gsc.nearPage1)}</div>
                <div className="skw-l">búsquedas en la página 2</div>
              </div>
            </div>
            <a className="btn btn-ghost btn-sm" href="#google-detalle">
              Ver búsquedas y páginas
            </a>
          </div>
        )}
      </div>

      {rivalsOpen && (
        <SeoRivalsModal
          projectId={props.projectId}
          ownDomain={props.ownDomain}
          cap={data.caps.competitors}
          current={data.rivals.map((r) => r.domain)}
          onClose={() => setRivalsOpen(false)}
          onToast={props.onToast}
        />
      )}
    </>
  );
}
