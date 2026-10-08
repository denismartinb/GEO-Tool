"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { addConfirmedAlias } from "@/lib/projects/brand-identity";

/**
 * ONBOARDING-IDENTITY-1 (log §237) — nombre comercial y alias, confirmados
 * ANTES del primer escaneo.
 *
 * El dominio y el nombre son cosas distintas: el dominio identifica la web, el
 * nombre es lo que una IA escribe cuando te recomienda. Con «Elcorteingles»
 * (sacado del dominio y nunca revisado) el escaneo midió cero aunque las
 * respuestas decían «El Corte Inglés». Aquí el nombre se ve, se edita y los
 * alias se confirman. Nada de esto cambia cómo compara el escaneo: cambia el
 * nombre que se le entrega.
 */
export function BrandIdentityCard({
  brand,
  onBrandChange,
  domain,
  pending,
  aliases,
  onAliasesChange,
  onConfirmBrand,
  aliasesAutoFound
}: {
  brand: string;
  onBrandChange: (value: string) => void;
  domain: string;
  /** La propuesta sale sólo del dominio y nadie la ha tocado: puede estar mal escrita. */
  pending: boolean;
  aliases: string[];
  onAliasesChange: (next: string[]) => void;
  /** «El nombre es correcto»: quita el aviso de pendiente sin cambiar nada. */
  onConfirmBrand: () => void;
  /** Cuántos alias se propusieron a partir de la portada (0 → entrada manual). */
  aliasesAutoFound: number;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  function add() {
    const result = addConfirmedAlias(aliases, draft, brand.trim() || domain);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setDraft("");
    onAliasesChange([...aliases, result.alias]);
  }

  return (
    <div className="card onb2-cpad" role="group" aria-labelledby="identity-title" style={{ marginBottom: 12 }}>
      <h2 id="identity-title" className="field-label" style={{ marginBottom: 4 }}>
        Tu marca
      </h2>
      <p className="add-hint" style={{ margin: "0 0 10px" }}>
        Así escribirán tu marca las IAs. Mídela con este nombre antes de lanzar el primer escaneo.
      </p>

      {pending ? (
        <div className="add-hint" role="status" style={{ marginBottom: 10 }}>
          <span>
            <b>Identidad pendiente de confirmar.</b> Hemos sacado «{brand}» del dominio y puede estar mal escrito
            (espacios, tildes). Revísalo: si no coincide con cómo te nombran, el escaneo puede medir cero.{" "}
            <button type="button" className="onb2-back" onClick={onConfirmBrand}>
              El nombre es correcto
            </button>
          </span>
        </div>
      ) : null}

      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <div>
          <label className="field-label" htmlFor="brand-name">
            Nombre comercial
          </label>
          <input
            id="brand-name"
            className="domain-input"
            style={{ width: "100%", padding: "8px 10px" }}
            value={brand}
            maxLength={120}
            onChange={(event) => onBrandChange(event.target.value)}
            spellCheck={false}
          />
        </div>
        <div>
          <span className="field-label">Dominio</span>
          <div className="mono" style={{ padding: "8px 0", color: "var(--ink-3)", overflowWrap: "anywhere" }}>
            {domain}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <label className="field-label" htmlFor="brand-alias">
          Otros nombres con los que te nombran (opcional)
        </label>
        <p className="add-hint" style={{ margin: "0 0 8px" }}>
          {aliasesAutoFound > 0
            ? `Propuestos a partir de tu web (${aliasesAutoFound}). Quita los que no sean tuyos.`
            : "No hemos encontrado ninguno en tu web. Añade los que conozcas: productos, sub-marcas, cómo te llaman."}
        </p>
        {aliases.length > 0 ? (
          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 8px", display: "flex", gap: 6, flexWrap: "wrap" }}>
            {aliases.map((alias) => (
              <li key={alias} className="eng-chip">
                {alias}
                <button
                  type="button"
                  aria-label={`Quitar alias ${alias}`}
                  onClick={() => onAliasesChange(aliases.filter((a) => a !== alias))}
                  style={{ marginLeft: 6, minWidth: 24, minHeight: 24 }}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            id="brand-alias"
            className="domain-input"
            style={{ flex: "1 1 200px", padding: "8px 10px" }}
            value={draft}
            maxLength={120}
            placeholder="Ej.: nombre de un producto"
            onChange={(event) => {
              setDraft(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add();
              }
            }}
            aria-describedby={error ? "brand-alias-err" : undefined}
            aria-invalid={error ? true : undefined}
          />
          <Button type="button" variant="outline" onClick={add} disabled={!draft.trim()}>
            Añadir
          </Button>
        </div>
        {error ? (
          <div id="brand-alias-err" className="field-err" role="alert" style={{ justifyContent: "flex-start" }}>
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}
