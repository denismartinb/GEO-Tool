"use client";

import type { BusinessContextUnidentifiedReason } from "@/lib/projects/business-profile";
import { Button } from "@/components/ui/button";

/**
 * ONBOARDING-IDENTITY-1 (log §237) — el campo de descripción del negocio.
 *
 * Sale cuando no se pudo leer la portada del dominio (webs grandes con
 * protección anti-bot, como elcorteingles.es). Es la única razón de fallo en la
 * que la persona puede hacer algo; si falló nuestro modelo, culpar a su web
 * sería decirle una causa que el código no puede saber (`gemini.md`).
 */
export function shouldAskForDescription(reason: BusinessContextUnidentifiedReason | null | undefined): boolean {
  return reason === "homepage_unreadable";
}

export const DESCRIPTION_MAX = 500;

export function DescriptionPrompt({
  reason,
  value,
  onChange,
  onSubmit,
  onSkip,
  pending
}: {
  reason: BusinessContextUnidentifiedReason | null | undefined;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onSkip: () => void;
  pending: boolean;
}) {
  if (!shouldAskForDescription(reason)) return null;
  const tooShort = value.trim().length < 20;
  return (
    <div className="card onb2-cpad" role="group" aria-labelledby="desc-title" style={{ marginTop: 12 }}>
      <h2 id="desc-title" className="field-label" style={{ marginBottom: 4 }}>
        No hemos podido leer tu web
      </h2>
      <p className="add-hint" style={{ margin: "0 0 10px" }}>
        Pasa con webs grandes o protegidas. Cuéntanos en una frase qué hace tu negocio y proponemos competidores y
        prompts a partir de eso. Son propuestas: podrás editarlas.
      </p>
      <label className="field-label" htmlFor="business-description">
        Qué hace tu negocio
      </label>
      <textarea
        id="business-description"
        name="business_description"
        className="domain-input"
        style={{ width: "100%", minHeight: 84, padding: 10, resize: "vertical" }}
        value={value}
        maxLength={DESCRIPTION_MAX}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Ej.: grandes almacenes en España: moda, electrónica, hogar y supermercado."
      />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
        <Button type="button" onClick={onSubmit} disabled={pending || tooShort}>
          {pending ? "Generando…" : "Generar con esta descripción"}
        </Button>
        <Button type="button" variant="outline" onClick={onSkip} disabled={pending}>
          Continuar sin sugerencias
        </Button>
        <span style={{ color: "var(--ink-4)", fontSize: 12 }}>
          {value.trim().length}/{DESCRIPTION_MAX}
        </span>
      </div>
    </div>
  );
}
