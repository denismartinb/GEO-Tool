"use client";

import { useState, useTransition } from "react";
import type { DiscoveredKeyword } from "@/lib/seo-tracking/discover-pure";
import { NO_TOPIC_ID } from "@/lib/seo-tracking/view-model";
import { addSeoKeywordsAction, discoverRivalsAction, discoverSeedAction, type DiscoverActionResult } from "../../seo-actions";
import { fmtInt, fmtPosition } from "../format";
import type { ReadyData } from "./seo-tracking";

/**
 * «Descubrir palabras» (SEO-TRACK-1 PR B, log §346). Three sources:
 * a seed word (DataForSEO keyword ideas), «Ya casi» (Search Console, free)
 * and the rivals' keywords (DataForSEO). The two paid searches share five a
 * day per account. Results are shown, never stored: only what the customer
 * ticks becomes a tracked keyword.
 */

export type NearKeyword = { keyword: string; position: number; impressions: number; topicId: string | null };

type Source = "seed" | "near" | "gap";
type Row = { keyword: string; detail: string; value: string; unit: string; defaultTopic: string };
type Pick = { on: boolean; topic: string; newName: string };

const NEW = "__new";
const NONE = "__none";
const LIMIT = 5;

function discoverError(result: DiscoverActionResult): string | null {
  switch (result.status) {
    case "ok":
      return null;
    case "limit":
      return "Has usado las 5 búsquedas de hoy. Mañana tendrás otras 5.";
    case "no_rivals":
      return "Elige tus rivales en el Resumen y vuelve aquí.";
    case "invalid":
      return "Escribe una palabra o una frase corta.";
    case "unavailable":
      return "El seguimiento de palabras todavía no está activo en tu cuenta.";
    case "provider":
      return "No hemos podido traer las palabras ahora. Vuelve a intentarlo en un rato.";
    default:
      return "No se ha podido buscar. Vuelve a intentarlo en un momento.";
  }
}

export function SeoDiscover(props: {
  projectId: string;
  data: ReadyData;
  near: NearKeyword[];
  gscPositions: Record<string, number>;
  gscConnected: boolean;
  onToast: (m: string) => void;
}) {
  const { data } = props;
  const [source, setSource] = useState<Source>("seed");
  const [seed, setSeed] = useState("");
  const [seedRows, setSeedRows] = useState<DiscoveredKeyword[] | null>(null);
  const [seedFor, setSeedFor] = useState("");
  const [gapRows, setGapRows] = useState<DiscoveredKeyword[] | null>(null);
  const [left, setLeft] = useState(data.discoveryLeft);
  const [error, setError] = useState<string | null>(null);
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [searching, startSearch] = useTransition();
  const [saving, startSave] = useTransition();

  const topics = data.topics.filter((t) => t.id !== NO_TOPIC_ID);
  const cap = data.caps.keywords;
  const pickKey = (s: Source, keyword: string) => `${s}:${keyword}`;
  const picked = Object.entries(picks).filter(([, p]) => p.on);
  const over = data.trackedCount + picked.length > cap;

  const handle = (result: DiscoverActionResult, set: (rows: DiscoveredKeyword[]) => void) => {
    if (result.status === "ok") {
      set(result.items);
      setLeft(result.left);
      setError(null);
      return;
    }
    if (result.status === "provider") setLeft(result.left);
    if (result.status === "limit") setLeft(0);
    setError(discoverError(result));
  };

  const searchSeed = () => {
    const q = seed.trim();
    if (!q) return;
    startSearch(async () => {
      const result = await discoverSeedAction({ projectId: props.projectId, seed: q });
      handle(result, (rows) => {
        setSeedRows(rows);
        setSeedFor(q);
      });
    });
  };

  const searchRivals = () =>
    startSearch(async () => {
      handle(await discoverRivalsAction({ projectId: props.projectId }), setGapRows);
    });

  const positionText = (keyword: string) => {
    const p = props.gscPositions[keyword];
    return p === undefined ? "Sin datos en tu Search Console" : `Puesto ${fmtPosition(p)} en tu Search Console`;
  };

  let rows: Row[] = [];
  if (source === "seed" && seedRows) {
    rows = seedRows.map((d) => ({
      keyword: d.keyword,
      detail: positionText(d.keyword),
      value: d.volume === null ? "—" : fmtInt(d.volume),
      unit: "búsq./mes",
      defaultTopic: NEW
    }));
  } else if (source === "near") {
    rows = props.near.map((d) => ({
      keyword: d.keyword,
      detail: `Puesto ${fmtPosition(d.position)} en tu Search Console`,
      value: fmtInt(d.impressions),
      unit: "impresiones",
      defaultTopic: d.topicId ?? NONE
    }));
  } else if (source === "gap" && gapRows) {
    rows = gapRows.map((d) => ({
      keyword: d.keyword,
      detail: d.rival ? `La tiene ${d.rival.domain}${d.rival.position ? `, en el puesto ${d.rival.position}` : ""}` : "",
      value: d.volume === null ? "—" : fmtInt(d.volume),
      unit: "búsq./mes",
      defaultTopic: NONE
    }));
  }
  rows = rows.filter((r) => !added.has(r.keyword));

  const pickFor = (row: Row): Pick => picks[pickKey(source, row.keyword)] ?? { on: false, topic: row.defaultTopic, newName: source === "seed" ? seedFor : "" };
  const setPick = (row: Row, patch: Partial<Pick>) =>
    setPicks((all) => ({ ...all, [pickKey(source, row.keyword)]: { ...pickFor(row), ...patch } }));

  const save = () => {
    const items = picked.map(([key, p]) => {
      const keyword = key.slice(key.indexOf(":") + 1);
      const topic = p.topic === NEW ? (p.newName.trim() ? { name: p.newName.trim() } : { none: true as const }) : p.topic === NONE ? { none: true as const } : { id: p.topic };
      return { keyword, topic, source: key.split(":")[0] as Source };
    });
    // One call per source, so each keyword keeps where it came from.
    const bySource: Record<Source, string> = { seed: "keyword_ideas", near: "search_console", gap: "competitor_gap" };
    startSave(async () => {
      const messages: string[] = [];
      for (const s of ["seed", "near", "gap"] as Source[]) {
        const group = items.filter((i) => i.source === s);
        if (!group.length) continue;
        const result = await addSeoKeywordsAction({
          projectId: props.projectId,
          source: bySource[s] as "keyword_ideas" | "search_console" | "competitor_gap",
          items: group.map(({ keyword, topic }) => ({ keyword, topic }))
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        if (result.message) messages.push(result.message);
      }
      setAdded((prev) => new Set([...prev, ...items.map((i) => i.keyword)]));
      setPicks({});
      setError(null);
      props.onToast(messages[messages.length - 1] ?? "Guardado.");
    });
  };

  const quota = (other: string) => (
    <p className="skw-quota">
      Te quedan {left} de {LIMIT} búsquedas hoy, compartidas con «{other}». Búsquedas al mes: datos de Google Search.
    </p>
  );

  return (
    <div className="card skw-disc">
      <div className="sa-ch">
        <h3>Descubrir palabras</h3>
      </div>
      <div className="skw-filters" role="group" aria-label="Fuente">
        {(
          [
            ["seed", "A partir de una palabra"],
            ["near", "Ya casi"],
            ["gap", "Las de tus rivales"]
          ] as Array<[Source, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={source === id}
            className={`gsc-st${source === id ? " gsc-st-on" : ""}`}
            onClick={() => {
              setSource(id);
              setError(null);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {source === "seed" && (
        <>
          <p className="skw-p">Escribe una palabra o frase y te damos búsquedas reales que la contienen, con cuánta gente las busca en España.</p>
          <form
            className="skw-seed"
            onSubmit={(e) => {
              e.preventDefault();
              searchSeed();
            }}
          >
            <label className="skw-field">
              Palabra o frase
              <input className="skw-inp" value={seed} maxLength={80} placeholder="por ejemplo, endodoncia" onChange={(e) => setSeed(e.target.value)} />
            </label>
            <button type="submit" className="btn btn-primary btn-sm" disabled={searching || left === 0 || !seed.trim()}>
              {searching ? "Buscando…" : "Buscar ideas"}
            </button>
          </form>
          {quota("Las de tus rivales")}
        </>
      )}

      {source === "near" && (
        <p className="skw-p">
          {props.gscConnected
            ? "Búsquedas de tu Search Console en las que ya sales entre los puestos 4 y 20 y que todavía no vigilas. No gastan búsquedas."
            : "Conecta tu Search Console más abajo para ver las búsquedas en las que ya casi sales en la página 1."}
        </p>
      )}

      {source === "gap" && (
        <>
          <p className="skw-p">
            {data.rivals.length
              ? `Palabras que traen visitas a ${data.rivals.map((r) => r.domain).join(", ")} y en las que tú no sales.`
              : "Elige tus rivales en el Resumen y aquí verás las palabras que les traen visitas y en las que tú no sales."}
          </p>
          {data.rivals.length > 0 && gapRows === null && (
            <div className="skw-row-btn">
              <button type="button" className="btn btn-primary btn-sm" onClick={searchRivals} disabled={searching || left === 0}>
                {searching ? "Buscando…" : "Buscar en tus rivales"}
              </button>
            </div>
          )}
          {data.rivals.length > 0 && quota("A partir de una palabra")}
        </>
      )}

      {error && (
        <p className="skw-err" role="alert">
          {error}
        </p>
      )}
      {searching && (
        <p className="skw-loading" role="status">
          <span className="skw-spin" aria-hidden="true" />
          {source === "seed" ? `Buscando ideas para «${seed.trim()}»…` : "Buscando palabras de tus rivales…"}
        </p>
      )}

      {!searching &&
        rows.map((row) => {
          const p = pickFor(row);
          return (
            <div key={row.keyword} className="skw-dk">
              <input type="checkbox" className="skw-cb" checked={p.on} onChange={(e) => setPick(row, { on: e.target.checked })} aria-label={`Vigilar ${row.keyword}`} />
              <span className="skw-dk-k">
                <b>{row.keyword}</b>
                <small>{row.detail}</small>
              </span>
              <span className="skw-dk-n">
                {row.value}
                <small>{row.unit}</small>
              </span>
              <span className="skw-dk-t">
                <select className="skw-sel" value={p.topic} onChange={(e) => setPick(row, { topic: e.target.value })} aria-label={`Tema de ${row.keyword}`}>
                  {topics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                  <option value={NEW}>Tema nuevo…</option>
                  <option value={NONE}>Sin tema</option>
                </select>
                {p.topic === NEW && (
                  <input className="skw-inp skw-inp-sm" value={p.newName} maxLength={80} placeholder="Nombre del tema" onChange={(e) => setPick(row, { newName: e.target.value })} aria-label={`Nombre del tema nuevo para ${row.keyword}`} />
                )}
              </span>
            </div>
          );
        })}
      {!searching && source === "seed" && seedRows !== null && rows.length === 0 && <p className="skw-p">No hay ideas nuevas para «{seedFor}». Prueba con otra palabra.</p>}
      {!searching && source === "gap" && gapRows !== null && rows.length === 0 && <p className="skw-p">Tus rivales no tienen palabras que tú no vigiles ya.</p>}
      {source === "near" && props.gscConnected && rows.length === 0 && <p className="skw-p">Ya vigilas todas.</p>}

      <div className="skw-sticky">
        <span className="skw-quota">
          {data.trackedCount} de {cap} palabras vigiladas
          {over && <b className="skw-down"> · Tu plan llega a {cap}</b>}
        </span>
        <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={saving || picked.length === 0 || over}>
          {saving ? "Guardando…" : `Vigilar ${picked.length} ${picked.length === 1 ? "palabra" : "palabras"}`}
        </button>
      </div>
    </div>
  );
}
