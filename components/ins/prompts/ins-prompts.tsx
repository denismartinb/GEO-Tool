"use client";

import { Fragment, useMemo, useState, type ReactNode } from "react";
import { Ic } from "@/components/ins/ic";
import { Bar } from "@/components/ins/kit/bar";
import { EngineLogo, engineName } from "@/components/ins/kit/engine";
import { Roll } from "@/components/ins/kit/roll";
import { Seg } from "@/components/ins/kit/seg";
import type { DetailRow } from "@/lib/ins/prompt-detail";
import {
  buildPromptsModel,
  fold,
  promptMatches,
  type PendingPrompt,
  type PromptItem,
  type TopicItem,
} from "@/lib/ins/prompts-model";
import { PromptSheet } from "./prompt-sheet";
import { sentimentClass, sentimentText } from "./sentiment";

/**
 * Prompts in the «Instrumento» system (CONSOLE-INSTRUMENTO-1 F5, log §373):
 * the lead, the strip (set visibility and one figure per engine), «Temas» and
 * «Prompts» tabs, and the side sheet of each prompt. Every figure counts the
 * rows of the last completed scan; a prompt added since then is listed as
 * pending, never as named or absent.
 */

type Tab = "temas" | "prompts";
type Filter = "all" | "yes" | "no";

function Marked({ text, query }: { text: string; query: string }) {
  const q = fold(query.trim());
  if (!q) return <>{text}</>;
  const folded = fold(text);
  // Folding can change the length of unusual characters: then there is no
  // safe slice to highlight and the text goes plain.
  if (folded.length !== text.length) return <>{text}</>;
  const at = folded.indexOf(q);
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark>{text.slice(at, at + q.length)}</mark>
      {text.slice(at + q.length)}
    </>
  );
}

function EnginesStrip({ item, providers }: { item: PromptItem; providers: string[] }) {
  if (item.pending) return <span />;
  return (
    <span
      className={`pr-e${item.namedBy.length ? "" : " none"}`}
      aria-label={
        item.namedBy.length ? `Te nombra ${item.namedBy.map(engineName).join(", ")}` : "Ningún motor te nombra"
      }
    >
      {providers.map((p) => (
        <span key={p} className={item.namedBy.includes(p) ? "on" : ""}>
          <EngineLogo provider={p} size={14} />
        </span>
      ))}
    </span>
  );
}

const competitorsText = (n: number) => `${n} ${n === 1 ? "competidor" : "competidores"}`;

function FlatRow({
  item,
  providers,
  query,
  onOpen,
}: {
  item: PromptItem;
  providers: string[];
  query: string;
  onOpen: () => void;
}) {
  return (
    <button type="button" className={`pr-row ${item.named ? "yes" : "no"}`} onClick={onOpen}>
      <span className="pr-st" aria-hidden="true">
        {item.pending ? <i className="pend" /> : item.named ? <Ic n="check" sm /> : <i />}
      </span>
      <span className="pr-t">
        <b>
          <Marked text={item.text} query={query} />
        </b>
        <span className="pr-m">
          {item.category ? <span>{item.category}</span> : null}
          {item.pending ? (
            <span className="pr-new">Se mide en tu próximo escaneo</span>
          ) : (
            <>
              <span className={item.named ? "tpos" : ""}>{item.named ? "Te nombra" : "No te nombra"}</span>
              <span>{competitorsText(item.competitors)}</span>
              {item.named && item.sentiment ? <span>{sentimentText(item.sentiment)}</span> : null}
            </>
          )}
        </span>
      </span>
      <EnginesStrip item={item} providers={providers} />
      <Ic n="chevr" sm />
    </button>
  );
}

function TopicQuestion({
  item,
  providers,
  query,
  onOpen,
}: {
  item: PromptItem;
  providers: string[];
  query: string;
  onOpen: () => void;
}) {
  return (
    <button type="button" className={`pq-q ${item.named ? "yes" : "no"}`} onClick={onOpen}>
      <span className="pq-qt">
        <b>
          <Marked text={item.text} query={query} />
        </b>
        <span className="pq-qm">
          {item.pending ? (
            <span className="pend">Se mide en tu próximo escaneo</span>
          ) : (
            <>
              <span className={`st ${item.named ? "ok" : "ko"}`}>{item.named ? "Te nombra" : "No te nombra"}</span>
              {item.named && item.sentiment ? <span>{sentimentText(item.sentiment)}</span> : null}
              <span>{competitorsText(item.competitors)}</span>
              <span>{item.citesOwn ? "cita tu web" : "no cita tu web"}</span>
            </>
          )}
        </span>
      </span>
      <EnginesStrip item={item} providers={providers} />
      <Ic n="chevr" sm />
    </button>
  );
}

export function InsPrompts({
  projectId,
  projectDomain,
  projectBrand,
  results,
  pending,
  competitors,
  providers,
  capUsed,
  capLimit,
}: {
  projectId: string;
  projectDomain: string;
  projectBrand: string;
  results: DetailRow[];
  pending: PendingPrompt[];
  competitors: Array<{ id: string; name: string; domain: string }>;
  providers: string[];
  /** Active prompts of the whole account, the scope the plan cap counts. */
  capUsed: number;
  capLimit: number;
}) {
  const model = useMemo(
    () => buildPromptsModel({ results, pending, projectDomain, providers }),
    [results, pending, projectDomain, providers],
  );
  const hasTopics = model.topics.length > 0;
  const [tab, setTab] = useState<Tab>(hasTopics ? "temas" : "prompts");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(model.topics[0] ? [model.topics[0].category] : []));
  const [selected, setSelected] = useState<string | null>(null);

  const current = selected ? (model.items.find((i) => i.key === selected) ?? null) : null;
  const tabNow: Tab = hasTopics ? tab : "prompts";

  const openTopic = (category: string) => {
    setTab("temas");
    setOpen((cur) => new Set(cur).add(category));
    window.setTimeout(() => {
      document
        .querySelector<HTMLElement>(`[data-topic="${CSS.escape(category)}"]`)
        ?.scrollIntoView({ block: "start", behavior: "smooth" });
    }, 30);
  };

  const topicList = model.topics
    .map((t) => ({ t, prompts: t.prompts.filter((p) => promptMatches(p, query, t.category)) }))
    .filter((x) => x.prompts.length > 0);

  const flatBase = model.items.filter((p) => promptMatches(p, query));
  const flatCounts = {
    all: flatBase.length,
    yes: flatBase.filter((p) => p.named).length,
    no: flatBase.filter((p) => !p.named && !p.pending).length,
  };
  const flatList =
    filter === "yes" ? flatBase.filter((p) => p.named) : filter === "no" ? flatBase.filter((p) => !p.named && !p.pending) : flatBase;

  const lead: ReactNode =
    model.scanned === 0 ? (
      "Aún no hay resultados de escaneo para estos prompts."
    ) : (
      <>
        Te nombran en {model.named} de {model.scanned} prompts.
        {model.best && model.worst && model.best.category !== model.worst.category ? (
          <>
            {" "}
            Fuerte en{" "}
            <a role="button" tabIndex={0} onClick={() => openTopic(model.best!.category)}>
              {model.best.category}
            </a>
            , flojo en{" "}
            <a role="button" tabIndex={0} onClick={() => openTopic(model.worst!.category)}>
              {model.worst.category}
            </a>
            .
          </>
        ) : null}
      </>
    );

  return (
    <>
      <p className="lead">{lead}</p>

      {model.scanned > 0 ? (
        <section className="pq-strip" aria-label="Visibilidad del conjunto y por motor">
          <div className="pq-all">
            <div className="pq-k">Visibilidad del conjunto</div>
            <div className="pq-v num">
              <Roll value={model.visibility} />
              <small>%</small>
            </div>
            <div className="pq-sp">
              <div
                className="pr-split"
                role="img"
                aria-label={`${model.named} prompts te nombran, ${model.scanned - model.named} no${model.pending ? `, ${model.pending} por medir` : ""}`}
              >
                <i style={{ flex: model.named }} />
                <i style={{ flex: model.scanned - model.named }} />
                {model.pending ? <i className="p" style={{ flex: model.pending }} /> : null}
              </div>
              <span className="num">
                {model.named} {model.named === 1 ? "prompt te nombra" : "prompts te nombran"} · {model.scanned - model.named} no
              </span>
            </div>
          </div>
          {model.engines.map((e, i) => (
            <div className="pq-eng" key={e.provider}>
              <div className="pq-k">
                <EngineLogo provider={e.provider} size={14} />
                {engineName(e.provider)}
                {e.provider === "perplexity" ? <span className="new">Nuevo</span> : null}
              </div>
              <div className="pq-ev">
                <b className="num">
                  <Roll value={e.percent} />
                  <small>%</small>
                </b>
                <Bar
                  value={e.percent}
                  cls="thin"
                  delay={i * 70}
                  label={`${engineName(e.provider)}: te nombra en el ${e.percent}% de sus respuestas`}
                />
              </div>
            </div>
          ))}
        </section>
      ) : null}

      <div className="pr-bar">
        {hasTopics ? (
          <Seg
            label="Vista de prompts"
            value={tabNow}
            onChange={setTab}
            options={[
              ["temas", "Temas"],
              ["prompts", "Prompts"],
            ]}
          />
        ) : null}
        <label className="search">
          <Ic n="search" sm />
          <input
            type="search"
            placeholder="Busca un prompt o un tema"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Buscar prompt"
          />
        </label>
        <span className="pr-cap num">
          {capUsed} de {capLimit} prompts de tu plan
        </span>
      </div>

      {!hasTopics ? (
        <div className="pr-note">
          Tus prompts no tienen temas asignados todavía. Cuando GenScore genere temas automáticamente, aparecerán
          agrupados aquí.
        </div>
      ) : null}

      <div className="pr-body" role="tabpanel">
        {tabNow === "temas" ? (
          topicList.length === 0 ? (
            <div className="empty-s">Ningún tema ni prompt con «{query}».</div>
          ) : (
            topicList.map(({ t, prompts }) => {
              const isOpen = open.has(t.category) || query.trim().length > 0;
              return (
                <section className={`pq-tp${isOpen ? " open" : ""}`} key={t.category} data-topic={t.category}>
                  <button
                    type="button"
                    className="pq-th"
                    aria-expanded={isOpen}
                    onClick={() =>
                      setOpen((cur) => {
                        const next = new Set(cur);
                        if (next.has(t.category)) next.delete(t.category);
                        else next.add(t.category);
                        return next;
                      })
                    }
                  >
                    <span className="pq-tn">
                      <span className="pq-tk">Tema</span>
                      <b>{t.category}</b>
                      <TopicSub topic={t} />
                    </span>
                    <span className="pq-sc">
                      <b className="num">
                        {t.visibility}
                        <small>%</small>
                      </b>
                      <Bar value={t.visibility} cls="thin" label={`${t.category}: visibilidad ${t.visibility}%`} />
                    </span>
                    <span className="pq-tr">
                      {t.mentions > 0 && t.sentiment ? (
                        <span className={sentimentClass(t.sentiment)}>{sentimentText(t.sentiment)}</span>
                      ) : null}
                      <span className="num">
                        {t.mentions} {t.mentions === 1 ? "mención" : "menciones"}
                      </span>
                    </span>
                    <Ic n="chevd" sm />
                  </button>
                  {isOpen ? (
                    <div className="pq-tb">
                      {prompts.map((p) => (
                        <TopicQuestion
                          key={p.key}
                          item={p}
                          providers={providers}
                          query={query}
                          onOpen={() => setSelected(p.key)}
                        />
                      ))}
                    </div>
                  ) : null}
                </section>
              );
            })
          )
        ) : (
          <Fragment>
            <div className="fchips pr-fc" role="group" aria-label="Filtro">
              {(
                [
                  ["all", "Todos"],
                  ["yes", "Te nombran"],
                  ["no", "No te nombran"],
                ] as const
              ).map(([k, label]) => (
                <button key={k} type="button" className="fchip" aria-pressed={filter === k} onClick={() => setFilter(k)}>
                  {label}
                  <span className="c num">{flatCounts[k]}</span>
                </button>
              ))}
            </div>
            <div className="pr-flat">
              {flatList.length ? (
                flatList.map((p) => (
                  <FlatRow key={p.key} item={p} providers={providers} query={query} onOpen={() => setSelected(p.key)} />
                ))
              ) : (
                <div className="empty-s">
                  {query.trim() ? `Ningún prompt coincide con «${query}».` : "Nada con estos filtros."}
                </div>
              )}
            </div>
          </Fragment>
        )}
      </div>

      {current ? (
        <PromptSheet
          key={current.key}
          projectId={projectId}
          projectDomain={projectDomain}
          projectBrand={projectBrand}
          competitors={competitors}
          promptId={current.rows[0]?.prompt_id ?? (current.pending ? current.key : null)}
          text={current.text}
          category={current.category}
          rows={current.rows as DetailRow[]}
          pending={current.pending}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </>
  );
}

function TopicSub({ topic }: { topic: TopicItem }) {
  const n = topic.prompts.length;
  return (
    <span className="num">
      {n} {n === 1 ? "pregunta" : "preguntas"} · te nombran en {topic.namedPrompts}
    </span>
  );
}
