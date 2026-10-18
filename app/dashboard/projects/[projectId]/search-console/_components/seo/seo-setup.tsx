"use client";

import { useState, useTransition } from "react";
import type { SeoTrackingCaps } from "@/lib/seo-tracking/caps";
import type { ProposedTopic } from "@/lib/seo-tracking/setup-proposal";
import { setupSeoTrackingAction } from "../../seo-actions";
import { fmtInt, fmtPosition } from "../format";

/**
 * First use of keyword tracking (SEO-TRACK-1 PR B, log §341). Rivals come
 * from the project's AI competitors that have a domain; topics and keywords
 * from the customer's own Search Console (one topic per page). Nothing is
 * saved until «Guardar y empezar»; nothing is ticked beyond what the plan
 * allows.
 */

export type ProposedRival = { domain: string; name: string };

type EditTopic = { name: string; targetUrl: string | null; keywords: Array<{ keyword: string; detail: string; on: boolean }> };

const DOMAIN_RE = /^(?=.{3,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/;

function cleanDomain(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0];
}

function fromProposal(t: ProposedTopic): EditTopic {
  return {
    name: t.name,
    targetUrl: t.targetUrl,
    keywords: t.keywords.map((k) => ({
      keyword: k.keyword,
      detail: `Puesto ${fmtPosition(k.position)} · ${fmtInt(k.impressions)} impresiones en 28 días`,
      on: k.checked
    }))
  };
}

export function SeoSetup(props: {
  projectId: string;
  caps: SeoTrackingCaps;
  proposal: { topics: ProposedTopic[]; rivals: ProposedRival[] };
  gscConnected: boolean;
  onToast: (m: string) => void;
  toast: string | null;
}) {
  const rivalCap = props.caps.competitors;
  const cap = props.caps.keywords;
  const [rivals, setRivals] = useState(() => props.proposal.rivals.map((r, i) => ({ ...r, on: i < rivalCap })));
  const [newRival, setNewRival] = useState("");
  const [topics, setTopics] = useState<EditTopic[]>(() => props.proposal.topics.map(fromProposal));
  const [manualName, setManualName] = useState("");
  const [manualKeywords, setManualKeywords] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const rivalsOn = rivals.filter((r) => r.on).length;
  const manualList = [...new Set(manualKeywords.split(/[\n,]/).map((k) => k.trim().toLocaleLowerCase("es-ES")).filter(Boolean))];
  const keywordsOn = topics.reduce((a, t) => a + t.keywords.filter((k) => k.on).length, 0) + (manualName.trim() ? manualList.length : 0);
  const over = keywordsOn > cap;

  const addRival = () => {
    const d = cleanDomain(newRival);
    if (!DOMAIN_RE.test(d)) {
      setError("Escribe un dominio, por ejemplo ejemplo.es.");
      return;
    }
    if (rivals.some((r) => r.domain === d)) {
      setNewRival("");
      return;
    }
    setRivals((all) => [...all, { domain: d, name: d, on: rivalsOn < rivalCap }]);
    setNewRival("");
    setError(null);
  };

  const setKeyword = (ti: number, ki: number, on: boolean) =>
    setTopics((all) => all.map((t, i) => (i !== ti ? t : { ...t, keywords: t.keywords.map((k, j) => (j === ki ? { ...k, on } : k)) })));

  const save = () => {
    const payload = topics
      .map((t) => ({ name: t.name.trim(), targetUrl: t.targetUrl, keywords: t.keywords.filter((k) => k.on).map((k) => k.keyword) }))
      .filter((t) => t.name && t.keywords.length);
    if (manualName.trim() && manualList.length) payload.push({ name: manualName.trim(), targetUrl: null, keywords: manualList });
    if (!payload.length) {
      setError("Marca al menos una palabra, o escribe un tema con sus palabras.");
      return;
    }
    start(async () => {
      const result = await setupSeoTrackingAction({
        projectId: props.projectId,
        rivals: rivals.filter((r) => r.on).map((r) => r.domain),
        topics: payload
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      props.onToast(result.message ?? "Guardado. Tu primera foto de Google llega el lunes.");
    });
  };

  return (
    <div className="skw">
      <div className="card">
        <div className="skw-step">
          <span className="skw-stepn">1</span>
          <h3>Tus rivales en Google</h3>
        </div>
        <p className="skw-p">
          {rivals.length
            ? "Te proponemos los competidores de tu proyecto que tienen web. "
            : "Escribe las webs con las que compites en Google. "}
          Tu plan permite {rivalCap === 1 ? "uno" : rivalCap}. Comparamos tus enlaces con los suyos y los marcamos en cada Top 10.
        </p>
        {rivals.map((r, i) => (
          <label key={r.domain} className="skw-rv">
            <input
              type="checkbox"
              className="skw-cb"
              checked={r.on}
              disabled={!r.on && rivalsOn >= rivalCap}
              onChange={(e) => setRivals((all) => all.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))}
            />
            <span>
              <b>{r.domain}</b>
              {r.name !== r.domain && <small>{r.name}</small>}
            </span>
          </label>
        ))}
        <form
          className="skw-seed"
          onSubmit={(e) => {
            e.preventDefault();
            addRival();
          }}
        >
          <label className="skw-field">
            Añadir otro dominio
            <input className="skw-inp" value={newRival} placeholder="ejemplo.es" onChange={(e) => setNewRival(e.target.value)} />
          </label>
          <button type="submit" className="btn btn-ghost btn-sm" disabled={!newRival.trim()}>
            Añadir
          </button>
        </form>
      </div>

      <div className="card">
        <div className="skw-step">
          <span className="skw-stepn">2</span>
          <h3>Temas y palabras</h3>
        </div>
        <p className="skw-p">
          {topics.length
            ? "Un tema por cada página tuya que ya sale en Google, con las búsquedas de tu Search Console. Puedes cambiar el nombre de cada tema."
            : props.gscConnected
              ? "Tu Search Console todavía no tiene búsquedas suficientes para proponerte temas. Escribe el primero."
              : "Escribe tu primer tema y sus palabras. Si conectas tu Search Console más abajo, te propondremos temas con tus búsquedas reales."}
        </p>
        {topics.map((t, ti) => (
          <div key={ti} className="skw-stopic">
            <input
              className="skw-tname"
              value={t.name}
              maxLength={80}
              onChange={(e) => setTopics((all) => all.map((x, j) => (j === ti ? { ...x, name: e.target.value } : x)))}
              aria-label="Nombre del tema"
            />
            {t.keywords.map((k, ki) => (
              <label key={k.keyword} className="skw-rv">
                <input type="checkbox" className="skw-cb" checked={k.on} onChange={(e) => setKeyword(ti, ki, e.target.checked)} />
                <span>
                  {k.keyword}
                  <small>{k.detail}</small>
                </span>
              </label>
            ))}
          </div>
        ))}
        <div className="skw-stopic">
          <label className="skw-field">
            {topics.length ? "Otro tema (opcional)" : "Nombre del tema"}
            <input className="skw-inp" value={manualName} maxLength={80} placeholder="por ejemplo, Implantes dentales" onChange={(e) => setManualName(e.target.value)} />
          </label>
          <label className="skw-field">
            Palabras, una por línea
            <textarea className="skw-inp skw-ta" rows={4} value={manualKeywords} placeholder={"implantes dentales madrid\nprecio implante dental"} onChange={(e) => setManualKeywords(e.target.value)} />
          </label>
        </div>
        {error && (
          <p className="skw-err" role="alert">
            {error}
          </p>
        )}
        <div className="skw-sticky">
          <span className="skw-quota">
            {rivalsOn} {rivalsOn === 1 ? "rival" : "rivales"} · {keywordsOn} de {cap} palabras
            {over && <b className="skw-down"> · Tu plan llega a {cap}</b>}
          </span>
          <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={pending || keywordsOn === 0 || over}>
            {pending ? "Guardando…" : "Guardar y empezar"}
          </button>
        </div>
      </div>
      {props.toast && (
        <div className="skw-toast" role="status">
          {props.toast}
        </div>
      )}
    </div>
  );
}
