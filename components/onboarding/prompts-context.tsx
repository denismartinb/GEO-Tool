"use client";

import type { PromptMixSummary } from "@/lib/projects/prompt-intent";
import { INTENT_ESTIMATE_NOTE, MARKET_LANGUAGE_NOTE, PROMPTS_NATURE_NOTE } from "@/lib/projects/proposal-copy";

/**
 * ONBOARDING-PROPOSALS-1 (log §237) — país, idioma y naturaleza de las
 * preguntas, encima de la lista. Presentacional: el estado vive en el asistente.
 */
export function PromptsContext({
  countryName,
  language,
  languageOptions,
  languageDetected,
  onLanguageChange,
  mix
}: {
  countryName: string;
  language: string;
  languageOptions: Array<{ code: string; name: string }>;
  /** El idioma salió de la detección por país y la persona no lo ha cambiado. */
  languageDetected: boolean;
  onLanguageChange: (code: string) => void;
  mix: PromptMixSummary;
}) {
  return (
    <div className="card onb2-cpad" role="group" aria-labelledby="prompts-context-title" style={{ marginBottom: 12 }}>
      <h2 id="prompts-context-title" className="field-label" style={{ marginBottom: 6 }}>
        Mercado e idioma
      </h2>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <span>
          <span style={{ color: "var(--ink-4)" }}>País: </span>
          <b>{countryName}</b>
        </span>
        <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <span style={{ color: "var(--ink-4)" }}>Idioma{languageDetected ? " (detectado)" : ""}:</span>
          <select
            value={language}
            onChange={(event) => onLanguageChange(event.target.value)}
            aria-label="Idioma de las preguntas"
            style={{ minHeight: 32 }}
          >
            {languageOptions.map((option) => (
              <option key={option.code} value={option.code}>
                {option.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="add-hint" style={{ margin: "8px 0 0" }}>
        {MARKET_LANGUAGE_NOTE}
      </p>
      <p className="add-hint" style={{ margin: "6px 0 0" }}>
        {PROMPTS_NATURE_NOTE}
      </p>
      {mix.total > 0 ? (
        <p className="add-hint" style={{ margin: "6px 0 0" }}>
          <b>Estimado:</b> {mix.informational} informativas · {mix.commercial} comerciales · {mix.local} locales ·{" "}
          {mix.branded} con tu marca, de {mix.total}. {INTENT_ESTIMATE_NOTE}
          {mix.local === 0 ? " Ninguna es local: si tu negocio atiende a una zona, añade alguna a mano." : ""}
        </p>
      ) : null}
    </div>
  );
}
