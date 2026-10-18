"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { TopicActionView, TopicWithActions } from "@/lib/seo-tracking/screen";
import { NO_TOPIC_ID } from "@/lib/seo-tracking/view-model";
import { setSeoActionDoneAction, untrackSeoKeywordAction } from "../../seo-actions";
import { ActionChip, DistBar, HistoryLine, PositionCell, pathOf } from "./seo-shared";
import type { ReadyData, SeoView } from "./seo-tracking";

function sameSite(domain: string, own: string) {
  const d = domain.replace(/^www\./, "");
  const o = own.replace(/^www\./, "");
  return d === o || d.endsWith(`.${o}`);
}

function ActionCard({
  action,
  index,
  onToggle,
  pending
}: {
  action: TopicActionView;
  index: number;
  onToggle: () => void;
  pending: boolean;
}) {
  return (
    <div className={`skw-act${action.done ? " is-done" : ""}`}>
      <div className="skw-ah">
        <span className="skw-n">{action.done ? "Hecho" : index + 1}</span>
        <ActionChip type={action.type} />
      </div>
      <h4>{action.title}</h4>
      {action.done ? (
        <p className="skw-why">Lo verás en las próximas fotos del lunes, en el puesto de las palabras del tema.</p>
      ) : (
        <>
          <p className="skw-why">{action.why}</p>
          <ol>
            {action.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </>
      )}
      <div className="skw-af">
        <span>Dato: {action.source}</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onToggle} disabled={pending}>
          {action.done ? "Deshacer" : "Marcar como hecho"}
        </button>
      </div>
    </div>
  );
}

function TopicDrawer(props: {
  projectId: string;
  ownDomain: string;
  topic: TopicWithActions;
  rivals: string[];
  firstWeek: boolean;
  keywordId: string | null;
  onSelectKeyword: (id: string) => void;
  onClose: () => void;
  onToast: (m: string) => void;
}) {
  const { topic } = props;
  const [pending, start] = useTransition();
  const [doneOverride, setDoneOverride] = useState<Record<string, boolean>>({});
  const closeRef = useRef<HTMLButtonElement>(null);
  const k = topic.keywords.find((x) => x.id === props.keywordId) ?? topic.keywords[0];
  const actions = topic.actions.map((a) => ({ ...a, done: doneOverride[a.key] ?? a.done }));
  const open = actions.filter((a) => !a.done);
  const done = actions.filter((a) => a.done);
  const rivalSet = props.rivals.map((r) => r.replace(/^www\./, ""));
  const best = topic.keywords.reduce((m, x) => (x.position !== null && x.position < m ? x.position : m), 99);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && props.onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props]);

  const toggle = (a: TopicActionView) => {
    const next = !a.done;
    setDoneOverride((m) => ({ ...m, [a.key]: next }));
    start(async () => {
      const r = await setSeoActionDoneAction({ projectId: props.projectId, topicId: topic.id, actionKey: a.key, done: next });
      if (!r.ok) {
        setDoneOverride((m) => ({ ...m, [a.key]: !next }));
        props.onToast(r.error);
        return;
      }
      props.onToast(next ? "Hecho. Lo verás en las próximas fotos del lunes." : "Vuelve a la lista.");
    });
  };

  const untrack = () => {
    if (!k) return;
    start(async () => {
      const r = await untrackSeoKeywordAction({ projectId: props.projectId, keywordId: k.id });
      props.onToast(r.ok ? r.message ?? "Ya no la vigilas." : r.error);
    });
  };

  return (
    <>
      <div className="skw-overlay is-drawer" onClick={props.onClose} aria-hidden="true" />
      <aside className="skw-drawer" role="dialog" aria-modal="true" aria-labelledby="skw-topic-t">
        <div className="skw-dh">
          <div>
            <h2 id="skw-topic-t">{topic.name}</h2>
            <div className="skw-dsub">
              Página: {topic.targetUrl ? pathOf(topic.targetUrl) : "sin página elegida"} · Top 10 revisado el lunes
            </div>
          </div>
          <button ref={closeRef} type="button" className="skw-x" onClick={props.onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="skw-db">
          <div className="skw-minis">
            <div className="skw-mini">
              <div className="skw-l">Puesto medio</div>
              <div className="skw-v">{topic.averagePosition ?? "—"}</div>
              <div className="skw-s">{topic.averagePosition === null && !props.firstWeek ? "ninguna en el Top 20" : "de las palabras del tema"}</div>
            </div>
            <div className="skw-mini">
              <div className="skw-l">En la página 1</div>
              <div className="skw-v">
                {props.firstWeek ? "—" : topic.pageOne} <span>de {topic.keywords.length}</span>
              </div>
              <div className="skw-s">palabras</div>
            </div>
            <div className="skw-mini">
              <div className="skw-l">Mejor puesto</div>
              <div className="skw-v">{best === 99 ? "—" : best}</div>
              <div className="skw-s">esta semana</div>
            </div>
            <div className="skw-mini">
              <div className="skw-l">Mapa de Google</div>
              <div className="skw-v skw-v-sm">{props.firstWeek ? "—" : topic.localPack ? "Sí sale" : "No sale"}</div>
              <div className="skw-s">{topic.localPack ? "negocios de la zona antes que las webs" : "sólo resultados web"}</div>
            </div>
          </div>

          {topic.id !== NO_TOPIC_ID && (
            <div className="card">
              <div className="sa-ch">
                <h3>Qué hacer</h3>
                <span className="sa-src">
                  {props.firstWeek ? "" : open.length ? `${open.length} ${open.length === 1 ? "paso" : "pasos"}, en este orden` : actions.length ? "todo hecho" : ""}
                </span>
              </div>
              {props.firstWeek ? (
                <p className="sa-empty">Te lo decimos el lunes, cuando tengamos la primera foto del Top 20.</p>
              ) : actions.length === 0 ? (
                <p className="sa-empty">Esta semana no vemos nada concreto que cambiar en este tema. Sigue midiéndolo cada lunes.</p>
              ) : (
                <div className="skw-acts">
                  {[...open, ...done].map((a) => (
                    <ActionCard key={a.key} action={a} index={open.indexOf(a)} onToggle={() => toggle(a)} pending={pending} />
                  ))}
                </div>
              )}
              <p className="sa-note" style={{ marginTop: 10, marginBottom: 0 }}>
                Los cambios en Google tardan semanas. Ningún paso garantiza un puesto; lo medimos cada lunes.
              </p>
            </div>
          )}

          <div className="card">
            <div className="sa-ch">
              <h3>Palabras del tema</h3>
              <span className="sa-src">pulsa una para ver su Top 10</span>
            </div>
            <table className="skw-kt">
              <thead>
                <tr>
                  <th>Palabra</th>
                  <th className="skw-hide-m">Tu página</th>
                  <th className="skw-r">Puesto</th>
                </tr>
              </thead>
              <tbody>
                {topic.keywords.map((x) => (
                  <tr
                    key={x.id}
                    className={x.id === k?.id ? "is-sel" : ""}
                    tabIndex={0}
                    aria-selected={x.id === k?.id}
                    onClick={() => props.onSelectKeyword(x.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        props.onSelectKeyword(x.id);
                      }
                    }}
                  >
                    <td>
                      {x.keyword}
                      <small className="skw-show-m">{x.url ? pathOf(x.url) : "Sin página en el Top 20"}</small>
                    </td>
                    <td className="skw-hide-m skw-mono">{pathOf(x.url)}</td>
                    <td className="skw-r">
                      <PositionCell k={x} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {k && (
            <div className="card">
              <div className="sa-ch">
                <h3>Top 10 de «{k.keyword}»</h3>
                <button type="button" className="skw-link" onClick={untrack} disabled={pending}>
                  Dejar de vigilar
                </button>
              </div>
              {k.state !== "ok" ? (
                <p className="sa-empty">{k.state === "pending" ? "Lo verás el lunes, con la próxima foto." : "Esta semana no pudimos leer esta búsqueda. Lo volvemos a intentar el lunes."}</p>
              ) : (
                <>
                  {k.top10.map((r) => {
                    const me = sameSite(r.domain, props.ownDomain);
                    const rival = rivalSet.some((d) => sameSite(r.domain, d));
                    return (
                      <div key={`${r.position}-${r.url}`} className={`skw-sr${me ? " is-you" : ""}`}>
                        <span className="skw-p-n">{r.position}</span>
                        <span className="skw-d">
                          {r.domain.replace(/^www\./, "")}
                          <small>
                            {r.title ? `${r.title} · ` : ""}
                            {pathOf(r.url)}
                          </small>
                        </span>
                        <span>{me ? <span className="skw-chip skw-chip-blue">Tú</span> : rival ? <span className="skw-chip skw-chip-vio">Rival</span> : null}</span>
                      </div>
                    );
                  })}
                  {k.position === null ? (
                    <div className="skw-sr is-you">
                      <span className="skw-p-n">—</span>
                      <span className="skw-d">
                        {props.ownDomain}
                        <small>Fuera del Top 20</small>
                      </span>
                      <span />
                    </div>
                  ) : k.position > 10 ? (
                    <div className="skw-sr is-you">
                      <span className="skw-p-n">{k.position}</span>
                      <span className="skw-d">
                        {props.ownDomain}
                        <small>Tu página · {pathOf(k.url)}</small>
                      </span>
                      <span>
                        <span className="skw-chip skw-chip-blue">Tú</span>
                      </span>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          )}

          <div className="card">
            <div className="sa-ch">
              <h3>Puesto medio, 8 semanas</h3>
              <span className="sa-src">más arriba es mejor</span>
            </div>
            {topic.history.filter((v) => v !== null).length >= 2 ? (
              <HistoryLine points={topic.history} />
            ) : (
              <p className="sa-empty">
                {topic.averagePosition === null && !props.firstWeek
                  ? "Ninguna palabra del tema sale todavía en el Top 20, así que no hay puesto medio que dibujar."
                  : "La línea aparece en cuanto haya dos semanas con dato."}
              </p>
            )}
          </div>

          {topic.questions.length > 0 && (
            <div className="card">
              <div className="sa-ch">
                <h3>Preguntas que Google enseña</h3>
              </div>
              <ul className="skw-paa">
                {topic.questions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
              <p className="sa-note" style={{ marginTop: 8, marginBottom: 0 }}>
                Salen en el bloque «Otras preguntas de los usuarios» de estas búsquedas.
              </p>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

export function SeoTopics(props: {
  projectId: string;
  ownDomain: string;
  data: ReadyData;
  topic: TopicWithActions | null;
  keywordId: string | null;
  onOpen: (id: string, keywordId?: string) => void;
  onClose: () => void;
  onSelectKeyword: (id: string) => void;
  onToast: (m: string) => void;
  onGo: (v: SeoView) => void;
}) {
  const { data } = props;
  const firstWeek = data.latestWeek === null;
  return (
    <>
      <p className="skw-sub">
        {data.topics.length} {data.topics.length === 1 ? "tema" : "temas"} · {data.trackedCount} de {data.caps.keywords} palabras vigiladas
      </p>
      <div className="skw-topics">
        {data.topics.map((t) => {
          const next = t.actions.find((a) => !a.done);
          return (
            <button key={t.id} type="button" className="skw-topic" onClick={() => props.onOpen(t.id)}>
              <h3>{t.name}</h3>
              <span className="skw-mono skw-faint">{t.targetUrl ? pathOf(t.targetUrl) : "Sin página elegida"}</span>
              <span className="skw-stats">
                <span>
                  <b>{firstWeek || t.averagePosition === null ? "—" : t.averagePosition}</b>puesto medio
                </span>
                <span>
                  <b>{t.keywords.length}</b>
                  {t.keywords.length === 1 ? "palabra" : "palabras"}
                </span>
              </span>
              <DistBar topic={t} />
              {!firstWeek && next && (
                <span className="skw-next">
                  Lo siguiente: <b>{next.title}</b>
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="sa-note" style={{ margin: 0 }}>
        Un tema es un grupo de palabras que se trabaja con una sola página. Pulsa uno para ver qué hacer, sus palabras y quién ocupa el Top 10. Para
        añadir palabras, ve a{" "}
        <button type="button" className="skw-link" onClick={() => props.onGo("descubrir")}>
          Descubrir palabras
        </button>
        .
      </p>
      {props.topic && (
        <TopicDrawer
          projectId={props.projectId}
          ownDomain={props.ownDomain}
          topic={props.topic}
          rivals={data.rivals.map((r) => r.domain)}
          firstWeek={firstWeek}
          keywordId={props.keywordId}
          onSelectKeyword={props.onSelectKeyword}
          onClose={props.onClose}
          onToast={props.onToast}
        />
      )}
    </>
  );
}
