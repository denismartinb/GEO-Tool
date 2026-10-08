"use client";

import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import type { PromptMixSummary } from "@/lib/projects/prompt-intent";
import {
  COVERAGE_NOTE,
  INTENT_ESTIMATE_NOTE,
  MARKET_LANGUAGE_NOTE,
  PROMPTS_DETAILS_LABEL,
  PROMPTS_NATURE_NOTE,
  PROMPTS_SHORT_NOTICE
} from "@/lib/projects/proposal-copy";

/**
 * ONBOARDING-PROPOSALS-1 (log §237) — país, idioma y naturaleza de las
 * preguntas, encima de la lista. Presentacional: el estado vive en el asistente.
 *
 * Disposición (corrección tras la prueba real de Denis): país e idioma son dos
 * campos con el MISMO aspecto (caja de 44px con etiqueta, igual que el país de
 * la barra de dominio); lo visible es un aviso corto y, si procede, la falta de
 * preguntas locales. Todo el detalle técnico —recuento estimado, método,
 * cobertura— sigue ahí, bajo «Cómo se han elegido»: no se borra honestidad.
 */
export function PromptsContext({
  countryName,
  countryFlag,
  language,
  languageOptions,
  languageDetected,
  onLanguageChange,
  mix
}: {
  countryName: string;
  /** Bandera ya pintada (el asistente es dueño de `Flag`); opcional. */
  countryFlag?: ReactNode;
  language: string;
  languageOptions: Array<{ code: string; name: string }>;
  /** El idioma salió de la detección por país y la persona no lo ha cambiado. */
  languageDetected: boolean;
  onLanguageChange: (code: string) => void;
  mix: PromptMixSummary;
}) {
  const languageName = languageOptions.find((option) => option.code === language)?.name ?? language;
  return (
    <div className="card onb2-cpad onb2-ctx" role="group" aria-labelledby="prompts-context-title">
      <h2 id="prompts-context-title" className="field-label">
        Mercado e idioma
      </h2>
      <div className="onb2-fields">
        <div className="onb2-field">
          <span className="onb2-field-lbl" id="prompts-country-lbl">
            País
          </span>
          <div className="field-sel field-sel--static" role="group" aria-labelledby="prompts-country-lbl">
            {countryFlag ? <span className="field-sel-flag">{countryFlag}</span> : null}
            <span className="field-sel-val">{countryName}</span>
          </div>
        </div>
        <div className="onb2-field">
          <label className="onb2-field-lbl" htmlFor="prompts-language">
            Idioma{languageDetected ? " (detectado)" : ""}
          </label>
          <div className="field-sel">
            <span className="field-sel-val">{languageName}</span>
            <Icon name="chevDown" size={14} className="text-[var(--ink-4)]" />
            <select
              id="prompts-language"
              value={language}
              onChange={(event) => onLanguageChange(event.target.value)}
              aria-label="Idioma de las preguntas"
            >
              {languageOptions.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      <p className="onb2-short-note">{PROMPTS_SHORT_NOTICE}</p>
      {mix.total > 0 && mix.local === 0 ? (
        <p className="onb2-short-note onb2-short-note--warn">
          Ninguna es local: si tu negocio atiende a una zona, añade alguna a mano.
        </p>
      ) : null}
      <details className="onb2-details">
        <summary>{PROMPTS_DETAILS_LABEL}</summary>
        <p>{MARKET_LANGUAGE_NOTE}</p>
        <p>{PROMPTS_NATURE_NOTE}</p>
        {mix.total > 0 ? (
          <p>
            <b>Estimado:</b> {mix.informational} informativas · {mix.commercial} comerciales · {mix.local} locales ·{" "}
            {mix.branded} con tu marca, de {mix.total}. {INTENT_ESTIMATE_NOTE}
          </p>
        ) : null}
        <p>{COVERAGE_NOTE}</p>
      </details>
    </div>
  );
}
