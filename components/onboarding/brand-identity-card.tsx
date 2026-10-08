"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
 *
 * Disposición (corrección tras la prueba real de Denis): campo → botón propio
 * «Confirmar nombre» (nunca un enlace dentro de una frase) → dominio como línea
 * secundaria; los alias van en un detalle que se abre solo si hay propuestas.
 * Menos texto, mismas confirmaciones y mismas validaciones.
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
  /** «Confirmar nombre»: quita el aviso de pendiente sin cambiar nada. */
  onConfirmBrand: () => void;
  /** Cuántos alias se propusieron a partir de la portada (0 → entrada manual). */
  aliasesAutoFound: number;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Abierto si hay algo que revisar (propuestos o ya añadidos); cerrado si no hay nada.
  const [aliasesOpen, setAliasesOpen] = useState(aliasesAutoFound > 0 || aliases.length > 0);

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
    <div className="card onb2-cpad onb2-brand" role="group" aria-labelledby="identity-title">
      <h2 id="identity-title" className="field-label">
        Confirma tu marca
      </h2>

      <label className="field-label" htmlFor="brand-name">
        Nombre comercial
      </label>
      <Input
        id="brand-name"
        value={brand}
        maxLength={120}
        onChange={(event) => onBrandChange(event.target.value)}
        spellCheck={false}
        aria-describedby={pending ? "brand-pending" : undefined}
      />
      {pending ? (
        <p id="brand-pending" role="status" className="onb2-brand-note">
          Revisa cómo se escribe tu marca
        </p>
      ) : null}
      {pending ? (
        <Button type="button" className="onb2-confirm" onClick={onConfirmBrand}>
          Confirmar nombre
        </Button>
      ) : null}
      <p className="onb2-brand-domain mono">{domain}</p>

      <details
        className="onb2-alias-details"
        open={aliasesOpen}
        onToggle={(event) => setAliasesOpen((event.currentTarget as HTMLDetailsElement).open)}
      >
        <summary>
          Otros nombres con los que te nombran (opcional)
          {aliases.length > 0 ? ` · ${aliases.length}` : ""}
        </summary>
        <p className="onb2-alias-hint">
          {aliasesAutoFound > 0
            ? `Propuestos a partir de tu web (${aliasesAutoFound}). Quita los que no sean tuyos.`
            : "No hemos encontrado ninguno en tu web. Añade los que conozcas: productos, sub-marcas, cómo te llaman."}
        </p>
        {aliases.length > 0 ? (
          <ul className="onb2-alias-list">
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
        <div className="onb2-alias-add">
          <label className="sr-only" htmlFor="brand-alias">
            Añadir otro nombre
          </label>
          <Input
            id="brand-alias"
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
      </details>
    </div>
  );
}
