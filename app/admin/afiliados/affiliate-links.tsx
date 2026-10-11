"use client";

import { useState } from "react";
import { AFFILIATE_LANDINGS, buildAffiliateShareUrl, normalizeCampaign } from "@/lib/admin/affiliates";

/** AFFILIATES-ADMIN-1 — builds the links to hand an affiliate, one per landing page. */
export function AffiliateLinks({ codes, siteUrl }: { codes: string[]; siteUrl: string }) {
  const [code, setCode] = useState(codes[0]);
  const [campaign, setCampaign] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const campaignSlug = normalizeCampaign(campaign);

  async function copy(id: string, url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(id);
      window.setTimeout(() => setCopied((current) => (current === id ? null : current)), 1800);
    } catch {
      setCopied(null);
    }
  }

  return (
    <section className="adm-aff">
      <h2 className="adm-aff-title">Enlaces para compartir</h2>
      <div className="adm-aff-form">
        <label className="adm-aff-field">
          <span>Código</span>
          <select value={code} onChange={(e) => setCode(e.target.value)}>
            {codes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="adm-aff-field">
          <span>
            Campaña <span className="adm-dim">(opcional)</span>
          </span>
          <input
            type="text"
            value={campaign}
            onChange={(e) => setCampaign(e.target.value)}
            placeholder="newsletter-octubre"
            maxLength={60}
          />
        </label>
      </div>
      <p className="adm-cmp-hint">
        Cada enlace lleva <code>ref={code}</code> (lo que atribuye el alta durante 90 días) y{" "}
        <code>utm_source={code}</code> · <code>utm_medium=afiliado</code>
        {campaignSlug ? (
          <>
            {" "}
            · <code>utm_campaign={campaignSlug}</code>
          </>
        ) : null}{" "}
        para verlo en PostHog.
      </p>
      <ul className="adm-aff-links">
        {AFFILIATE_LANDINGS.map((landing) => {
          const url = buildAffiliateShareUrl({ siteUrl, code, path: landing.path, campaign });
          return (
            <li key={landing.id} className="adm-aff-link">
              <span className="adm-aff-label">{landing.label}</span>
              <input className="adm-aff-url" readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label={`Enlace a ${landing.label}`} />
              <button type="button" className="adm-chip adm-aff-copy" onClick={() => copy(landing.id, url)}>
                {copied === landing.id ? "Copiado" : "Copiar"}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
