"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Icon } from "@/components/ui/icon";
import { EngineGlyph } from "@/components/ui/engine-glyph";
import { useTypewriter } from "@/components/ui/use-typewriter";
import type { GenerateMorePromptsResult, ProjectSetupSuggestion } from "@/app/dashboard/projects/actions";
import type { PromptCategory } from "@/lib/projects/prompt-categories";
import { isWellFormedDomain, MAX_USER_COMPETITORS, sanitizePromptLineText } from "@/lib/projects/project-form";
import { takePendingDomain } from "@/lib/onboarding/pending-domain";
import { getEngineMeta } from "@/lib/scan/engine-meta";

const DEFAULT_PROMPT_CAP = 10;
const GENERATE_MORE_BATCH_SIZE = 5;

const COUNTRIES: Array<{ code: string; name: string }> = [
  { code: "ES", name: "España" },
  { code: "MX", name: "México" },
  { code: "AR", name: "Argentina" },
  { code: "CO", name: "Colombia" },
  { code: "US", name: "Estados Unidos" },
  { code: "UK", name: "Reino Unido" },
  { code: "DE", name: "Alemania" },
  { code: "FR", name: "Francia" },
  { code: "IT", name: "Italia" },
  { code: "PT", name: "Portugal" },
  { code: "BR", name: "Brasil" }
];

const TYPE_SAMPLES = ["tudominio.com", "miempresa.io", "tienda.es", "startup.ai", "agencia.com"];

// Mismos motores, mismos glifos y colores que Visión general/Prompts
// (lib/scan/engine-meta.ts, components/ui/engine-glyph.tsx) — no un set
// paralelo de puntos de color inventado para este flujo.
const ENGINE_PROVIDERS = ["gemini", "claude", "openai"] as const;

// Nombres amigables para lo que devuelve `languageForCountry`
// (lib/projects/project-form.ts) — sólo cubre los códigos que ese mapa puede
// producir para los países listados en COUNTRIES arriba. Cae al código crudo
// si algún día aparece uno nuevo, en vez de reventar.
const LANGUAGE_NAMES: Record<string, string> = {
  es: "Español",
  en: "Inglés",
  de: "Alemán",
  fr: "Francés",
  it: "Italiano",
  pt: "Portugués"
};

// Colores decorativos del avatar de competidor (iniciales sobre círculo de
// color) — puramente estéticos, ciclan por índice. No son favicons reales.
const AVATAR_COLORS = ["#2563eb", "#7c3aed", "#0f9d8e", "#ff642d", "#d97706", "#db2777"];

const WIZARD_STEP_LABELS = ["Dominio", "Competidores", "Prompts"];

// Checklist cosmético mostrado mientras `suggestAction` (Gemini) resuelve.
// Cada paso describe trabajo real que ocurre dentro de suggestProjectSetup
// (lib/llm/gemini.ts): lee el dominio, busca competidores y genera prompts.
function suggestionsSteps(domain: string): string[] {
  const cleanDomain = domain.trim() || "tu dominio";
  return [
    `Leyendo el contenido de ${cleanDomain}`,
    "Buscando competidores relevantes",
    "Generando prompts de monitorización con IA"
  ];
}

// Checklist cosmético mostrado mientras `createAction` resuelve. Cada paso
// describe trabajo real que ocurre dentro de createProject
// (app/dashboard/projects/actions.ts): crea el proyecto, persiste prompts y
// competidores, y lanza el primer escaneo (createPendingScanRun).
const CREATE_PROJECT_STEPS = [
  "Guardando tu dominio y configuración",
  "Creando tus prompts y competidores",
  "Lanzando tu primer escaneo"
];

// `source` distingue una fila que vino de la sugerencia de Gemini de una
// añadida a mano ("Añadir competidor") — el chip "sugerido" del paso 1 sólo
// se pinta en la primera, para no afirmar una sugerencia de IA que no existió
// (ver docs/design-reference/onboarding-domain-redesign-1/README.md). `id` es
// una identidad de UI local (asignada por `newId()` al montar cada fila,
// nunca enviada al servidor) — sostiene qué filas están plegadas/desplegadas
// sin depender del índice, que cambia al borrar una fila de en medio.
type Competitor = { id: number; name: string; domain: string; source: "suggested" | "manual" };
type PromptRow = { id: number; text: string; category: PromptCategory | null };

// Banderitas mini (mismas que onboarding.jsx) — solo los códigos definidos en
// la referencia; el resto cae al fallback "us" igual que `F[code] || F.us`.
function Flag({ code }: { code: string }) {
  const flags: Record<string, ReactNode> = {
    us: (
      <svg viewBox="0 0 19 13">
        <rect width="19" height="13" fill="#fff" />
        {[0, 2, 4, 6, 8, 10, 12].map((y) => (
          <rect key={y} y={y} width="19" height="1" fill="#b22234" />
        ))}
        <rect width="9" height="7" fill="#3c3b6e" />
      </svg>
    ),
    es: (
      <svg viewBox="0 0 19 13">
        <rect width="19" height="13" fill="#c60b1e" />
        <rect y="3.25" width="19" height="6.5" fill="#ffc400" />
      </svg>
    ),
    mx: (
      <svg viewBox="0 0 19 13">
        <rect width="19" height="13" fill="#fff" />
        <rect width="6.33" height="13" fill="#006847" />
        <rect x="12.67" width="6.33" height="13" fill="#ce1126" />
      </svg>
    ),
    uk: (
      <svg viewBox="0 0 19 13">
        <rect width="19" height="13" fill="#012169" />
        <path d="M0 0l19 13M19 0L0 13" stroke="#fff" strokeWidth={2} />
        <path d="M9.5 0v13M0 6.5h19" stroke="#fff" strokeWidth={3} />
        <path d="M9.5 0v13M0 6.5h19" stroke="#c8102e" strokeWidth={1.6} />
      </svg>
    ),
    de: (
      <svg viewBox="0 0 19 13">
        <rect width="19" height="4.33" fill="#000" />
        <rect y="4.33" width="19" height="4.33" fill="#dd0000" />
        <rect y="8.66" width="19" height="4.34" fill="#ffce00" />
      </svg>
    ),
    fr: (
      <svg viewBox="0 0 19 13">
        <rect width="19" height="13" fill="#fff" />
        <rect width="6.33" height="13" fill="#0055a4" />
        <rect x="12.67" width="6.33" height="13" fill="#ef4135" />
      </svg>
    )
  };
  return (
    <span className="meta-flag" style={{ width: 18, height: 12 }}>
      {flags[code] || flags.us}
    </span>
  );
}

// Barra de pasos del asistente: tres segmentos con etiqueta debajo
// (.onb2-steps/.onb2-stp/.onb2-stp-bar/.onb2-stp-lb, ONBOARDING-DOMAIN-
// REDESIGN-1). Sustituye a los círculos numerados de la versión anterior.
function WizardSteps({ currentStep }: { currentStep: number }) {
  return (
    <div className="onb2-steps" aria-label="Progreso del asistente">
      {WIZARD_STEP_LABELS.map((label, index) => {
        const cls = index === currentStep ? "onb2-stp on" : index < currentStep ? "onb2-stp done" : "onb2-stp";
        return (
          <div key={label} className={cls} aria-current={index === currentStep ? "step" : undefined}>
            <span className="onb2-stp-bar" aria-hidden="true" />
            <span className="onb2-stp-lb">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

// Avanza un índice de "paso activo" en un timer fijo, puramente cosmético:
// no representa progreso real medido del backend (la llamada es una única
// promesa opaca). Se detiene en el último paso (nunca lo marca "hecho") hasta
// que `done` sea true, momento en el que el componente que lo usa se
// desmonta — por eso no hace falta un estado "todo completado".
function useStepCycle(stepCount: number, done: boolean, intervalMs = 1400) {
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (done) return;
    if (active >= stepCount - 1) return;
    const timer = setTimeout(() => setActive((value) => Math.min(value + 1, stepCount - 1)), intervalMs);
    return () => clearTimeout(timer);
  }, [active, done, stepCount, intervalMs]);
  return active;
}

// Checklist "esto es lo que estamos haciendo" para las dos cargas embebidas
// del asistente (analizar dominio, crear proyecto). Igual que antes: SIN
// porcentaje ni "X de Y pasos" — la llamada real es una única promesa opaca.
// Los pasos previos al activo se marcan "done" solo como parte de la
// animación cosmética; el paso activo se queda en spinner hasta que la
// promesa real resuelve y el componente que lo usa se desmonta.
function OnbChecklist({ steps, activeIndex }: { steps: string[]; activeIndex: number }) {
  return (
    <div className="onb2-check">
      {steps.map((label, index) => {
        const isDone = index < activeIndex;
        const isActive = index === activeIndex;
        return (
          <div key={label} className={isActive ? "onb2-ci on" : "onb2-ci"}>
            {isDone ? (
              <span className="onb2-cdone">
                <Icon name="check" size={10} />
              </span>
            ) : isActive ? (
              <span className="onb2-cspin" aria-hidden="true" />
            ) : (
              <span className="onb2-cpending" aria-hidden="true" />
            )}
            {label}
          </div>
        );
      })}
    </div>
  );
}

// Estado de carga al sugerir competidores y prompts con Gemini (paso 0 → 1).
// A diferencia de la versión anterior, no es una cortina fija a pantalla
// completa: es la misma tarjeta del paso 0, con un checklist y un esqueleto
// de filas orientativo debajo (ONBOARDING-DOMAIN-REDESIGN-1).
function DomainAnalyzingCard({ domain }: { domain: string }) {
  const steps = useMemo(() => suggestionsSteps(domain), [domain]);
  const activeIndex = useStepCycle(steps.length, false);
  return (
    <div className="card onb2-cpad">
      <OnbChecklist steps={steps} activeIndex={activeIndex} />
      <div style={{ borderTop: "1px solid var(--line-soft)", marginTop: 14 }}>
        {[70, 54, 62, 46].map((width, index) => (
          <div className="onb2-skelrow" key={index}>
            <span className="onb2-fav" aria-hidden="true" />
            <span style={{ flex: 1 }}>
              <span className="onb2-skel" style={{ width: `${width}%` }} />
              <span className="onb2-skel" style={{ width: `${width - 26}%`, height: 8, marginTop: 6, opacity: 0.7 }} />
            </span>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 12, color: "var(--ink-4)", margin: "14px 0 0", textAlign: "center" }}>
        No cierres ni recargues esta pestaña.
      </p>
    </div>
  );
}

/**
 * LLM-RESILIENCE-1: shown on the step whose automatic suggestion came back
 * empty, at the moment the user is looking at that empty step.
 *
 * Says only what is known. The server can tell that the suggestion did not
 * produce anything, but from here we cannot tell a provider outage apart from
 * a domain the model genuinely had nothing to say about — so the copy claims
 * neither. The operator gets the real cause by email
 * (`lib/llm/llm-incident.ts`); the user gets the way forward.
 */
function SuggestionGapNotice({ kind }: { kind: "competitors" | "prompts" }) {
  const what = kind === "competitors" ? "competidores" : "prompts";
  return (
    <div className="add-hint" role="status" style={{ marginBottom: 12 }}>
      <Icon name="alertCircle" size={13} />
      No hemos podido sugerir {what} automáticamente para este dominio. Añádelos a mano — el escaneo funciona igual y
      podrás cambiarlos cuando quieras.
    </div>
  );
}

// Panel fijo "Resumen del lanzamiento" — refleja el estado real del
// asistente en cada paso, nunca una cifra inventada. `competitorsCount` /
// `promptsCount` son `null` mientras ese paso no se ha alcanzado todavía.
function LaunchSummaryPanel({
  domain,
  languageKnown,
  language,
  engineCount,
  competitorsCount,
  promptsCount
}: {
  domain: string;
  languageKnown: boolean;
  language: string;
  engineCount: number;
  competitorsCount: number | null;
  promptsCount: number | null;
}) {
  const estimatedResponses = promptsCount !== null ? promptsCount * engineCount : null;
  return (
    <div>
      <div className="onb2-seclbl">Resumen del lanzamiento</div>
      <div className="card onb2-cpad onb2-panel">
        <div className="onb2-prow">
          <span className="onb2-pico">
            <Icon name="globe" size={14} />
          </span>
          <span className="onb2-pk">Dominio</span>
          <span className={domain ? "onb2-pv mono" : "onb2-pv mono na"}>{domain || "Pendiente"}</span>
        </div>
        <div className="onb2-prow">
          <span className="onb2-pico">
            <Icon name="lang" size={14} />
          </span>
          <span className="onb2-pk">Idioma</span>
          <span className={languageKnown ? "onb2-pv" : "onb2-pv na"}>
            {languageKnown ? LANGUAGE_NAMES[language] ?? language : "Pendiente"}
            {languageKnown ? <span style={{ color: "var(--ink-4)", fontWeight: 500 }}> · detectado</span> : null}
          </span>
        </div>
        <div className="onb2-prow">
          <span className="onb2-pico">
            <Icon name="overview" size={14} />
          </span>
          <span className="onb2-pk">Motores</span>
          <span className="onb2-pv">{engineCount}</span>
        </div>
        <div className="onb2-prow">
          <span className="onb2-pico">
            <Icon name="competitors" size={14} />
          </span>
          <span className="onb2-pk">Competidores</span>
          <span className={competitorsCount === null ? "onb2-pv na" : "onb2-pv"}>
            {competitorsCount === null ? "Pendiente" : competitorsCount}
          </span>
        </div>
        <div className="onb2-prow">
          <span className="onb2-pico">
            <Icon name="prompts" size={14} />
          </span>
          <span className="onb2-pk">Prompts</span>
          <span className={promptsCount === null ? "onb2-pv na" : "onb2-pv"}>{promptsCount === null ? "Pendiente" : promptsCount}</span>
        </div>
        <div className="onb2-est">
          {estimatedResponses !== null ? (
            <>
              <div className="onb2-est-n">{estimatedResponses}</div>
              <div className="onb2-est-l">respuestas estimadas en el primer escaneo</div>
              <div className="onb2-est-f">
                {promptsCount} prompts × {engineCount} motores. Si tu plan repite la tanda, serán más.
              </div>
            </>
          ) : (
            <div className="onb2-est-f" style={{ marginTop: 0 }}>
              El total de respuestas aparecerá aquí cuando elijas tus prompts.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type OnboardingWizardProps = {
  errorMessage: string | null;
  atLimit?: boolean;
  /** Owner's real plan cap on active prompts (app/pricing/plans-data.ts) —
   * bounds both the manual "Añadir prompt" button and "Generar N más" here,
   * so a Starter/Pro/Agency user isn't stuck at a hardcoded 10 during
   * onboarding (SCAN-CHAIN-1 follow-up). */
  promptCap?: number;
  suggestAction: (input: { domain: string; country: string }) => Promise<ProjectSetupSuggestion>;
  generateMorePromptsAction: (input: {
    domain: string;
    country: string;
    existingPromptTexts: string[];
    existingCategories: string[];
  }) => Promise<GenerateMorePromptsResult>;
  createAction: (formData: FormData) => void | Promise<void>;
};

// Cuerpo del paso de prompts. Vive dentro del <form> porque necesita
// `useFormStatus()` (sólo funciona en un descendiente de <form>) para saber
// si `createAction` está en vuelo y, si lo está, sustituir la lista editable
// por la tarjeta "Creando…" en el mismo sitio — nunca una cortina a pantalla
// completa (ONBOARDING-DOMAIN-REDESIGN-1; antes era `CreateProjectOverlay`).
function PromptsStepBody({
  prompts,
  promptCap,
  validPromptCount,
  promptRoomLeft,
  generateMoreCount,
  categoryCounts,
  isGeneratingMore,
  generateMoreError,
  openPrompts,
  toggleOpenPrompt,
  updatePrompt,
  removePrompt,
  addPrompt,
  generateMorePromptsAutomatically,
  goBack
}: {
  prompts: PromptRow[];
  promptCap: number;
  validPromptCount: number;
  promptRoomLeft: number;
  generateMoreCount: number;
  categoryCounts: Array<[string, number]>;
  isGeneratingMore: boolean;
  generateMoreError: string | null;
  openPrompts: Set<number>;
  toggleOpenPrompt: (id: number) => void;
  updatePrompt: (index: number, value: string) => void;
  removePrompt: (index: number) => void;
  addPrompt: () => void;
  generateMorePromptsAutomatically: () => void;
  goBack: () => void;
}) {
  const { pending } = useFormStatus();
  const activeIndex = useStepCycle(CREATE_PROJECT_STEPS.length, !pending);

  if (pending) {
    return (
      <>
        <div className="onb2-seclbl">Lanzando</div>
        <div className="card onb2-cpad">
          <OnbChecklist steps={CREATE_PROJECT_STEPS} activeIndex={activeIndex} />
        </div>
        <div className="onb2-foot">
          <Button type="button" variant="outline" disabled>
            Atrás
          </Button>
          <Button type="submit" disabled className="inline-flex items-center gap-2">
            Creando…
          </Button>
        </div>
      </>
    );
  }

  const maxCategoryCount = categoryCounts.length ? categoryCounts[0][1] : 0;

  return (
    <>
      <div className="onb2-seclbl">
        {validPromptCount} prompt{validPromptCount === 1 ? "" : "s"} · límite de tu plan: {promptCap}
      </div>
      <div className="card" style={{ overflow: "hidden" }}>
        {prompts.map((row, index) => {
          const isOpen = openPrompts.has(row.id);
          return (
            <div key={row.id} className={isOpen ? "onb2-row align-top" : "onb2-row"}>
              {isOpen ? (
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Textarea
                    aria-label={`Prompt ${index + 1}`}
                    rows={3}
                    className="onb-prompt-input onb2-prompt-edit"
                    placeholder="Ej. ¿Cuáles son las mejores herramientas para…?"
                    value={row.text}
                    onChange={(event) => updatePrompt(index, event.target.value)}
                    autoFocus
                  />
                </div>
              ) : (
                <span className="onb2-ptext">{row.text || "Prompt vacío"}</span>
              )}
              {row.category ? <span className="onb2-chip n">{row.category}</span> : null}
              <button
                type="button"
                className="onb2-iconbtn"
                aria-label={isOpen ? `Listo, prompt ${index + 1}` : `Editar prompt ${index + 1}`}
                onClick={() => toggleOpenPrompt(row.id)}
              >
                <Icon name={isOpen ? "check" : "settings"} size={14} />
              </button>
              <button
                type="button"
                className="onb2-iconbtn"
                aria-label={`Quitar prompt ${index + 1}`}
                onClick={() => removePrompt(index)}
              >
                <Icon name="trash" size={14} />
              </button>
            </div>
          );
        })}
        {categoryCounts.length > 0 ? (
          <div className="onb2-cov">
            {categoryCounts.map(([category, count]) => (
              <div className="onb2-covc" key={category}>
                <span className="onb2-cov-l">
                  <span>{category}</span>
                  <b>{count}</b>
                </span>
                <span className="onb2-cov-b">
                  <span className="onb2-cov-f" style={{ width: `${(count / maxCategoryCount) * 100}%` }} />
                </span>
              </div>
            ))}
          </div>
        ) : null}
        <div className="onb2-listfoot">
          <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {promptRoomLeft > 0 ? (
              <Button type="button" variant="outline" onClick={generateMorePromptsAutomatically} disabled={isGeneratingMore}>
                <Icon name="sparkles" size={13} />
                {isGeneratingMore ? "Generando…" : `Generar ${generateMoreCount} más`}
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={addPrompt} disabled={prompts.length >= promptCap}>
              <Icon name="plus" size={13} />
              Añadir prompt
            </Button>
          </span>
        </div>
      </div>

      {generateMoreError ? <p className="feedback error">{generateMoreError}</p> : null}

      <div className="onb2-foot">
        <Button type="button" variant="outline" onClick={goBack}>
          Atrás
        </Button>
        <Button type="submit" disabled={validPromptCount === 0} className="inline-flex items-center gap-2">
          Crear dominio y escanear
          <Icon name="arrRight" size={16} />
        </Button>
      </div>
    </>
  );
}

export function OnboardingWizard({
  errorMessage,
  atLimit = false,
  promptCap = DEFAULT_PROMPT_CAP,
  suggestAction,
  generateMorePromptsAction,
  createAction
}: OnboardingWizardProps) {
  const [step, setStep] = useState(0);
  const [domain, setDomain] = useState("");
  const [country, setCountry] = useState("ES");
  const [language, setLanguage] = useState("es");
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [prompts, setPrompts] = useState<PromptRow[]>([]);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  /**
   * Identidad de UI local para cada fila de competidor/prompt — nunca sale de
   * este componente ni llega al servidor. Filas sugeridas por Gemini nacen
   * plegadas (`open*` no las contiene); una fila nueva vía "Añadir…" nace
   * desplegada, porque una fila vacía y plegada no da nada en lo que hacer
   * clic para rellenarla.
   */
  const nextId = useRef(0);
  const newId = () => {
    nextId.current += 1;
    return nextId.current;
  };
  const [openCompetitors, setOpenCompetitors] = useState<Set<number>>(new Set());
  const [openPrompts, setOpenPrompts] = useState<Set<number>>(new Set());
  function toggleId(setter: (updater: (prev: Set<number>) => Set<number>) => void, id: number) {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  /**
   * LLM-RESILIENCE-1: which halves of the automatic suggestion came back
   * empty, so the step that is actually empty can say so.
   *
   * `suggestError` alone could not do this job. It is rendered inside the
   * `step === 0` block, and the failure path calls `setStep(1)` in the same
   * update — so the one message the wizard had was written onto a screen the
   * user was being navigated away from at that instant. Worse, the common case
   * on 2026-08-09 never set it at all: competitors failed while prompts
   * succeeded, so `ok` was true and the user landed on an empty competitors
   * step with nothing to read.
   */
  const [suggestFailed, setSuggestFailed] = useState<Array<"competitors" | "prompts">>([]);
  const [isPending, startTransition] = useTransition();
  const [isDomainFocused, setIsDomainFocused] = useState(false);
  const [showDomainErr, setShowDomainErr] = useState(false);
  const [isGeneratingMore, startGenerateMoreTransition] = useTransition();
  const [generateMoreError, setGenerateMoreError] = useState<string | null>(null);

  /**
   * Recoge el dominio que la persona escribió en el hero de la landing.
   *
   * Hasta hoy ese campo se tiraba: escribías tu dominio en la portada, te
   * registrabas, y el asistente te lo volvía a pedir como si no lo hubieras
   * dicho. Se lee una sola vez al montar y se consume, para que un segundo
   * dominio en la misma cuenta no nazca relleno con el primero.
   *
   * En un efecto y no en el estado inicial porque `localStorage` no existe en
   * el servidor: leerlo durante el render rompería la hidratación.
   */
  useEffect(() => {
    const pending = takePendingDomain();
    if (pending) setDomain((current) => (current ? current : pending));
  }, []);

  const domainHasValue = domain.trim().length > 0;
  const domainIsValid = isWellFormedDomain(domain);
  const typedPlaceholder = useTypewriter(TYPE_SAMPLES, !isDomainFocused && domain === "");
  const selectedCountry = useMemo(
    () => COUNTRIES.find((option) => option.code === country) ?? COUNTRIES[0],
    [country]
  );

  const competitorsText = useMemo(
    () =>
      competitors
        .map((c) => `${c.name.trim()}|${c.domain.trim()}`)
        .filter((line) => line.length > 1 && !line.startsWith("|") && !line.endsWith("|"))
        .join("\n"),
    [competitors]
  );
  const promptsText = useMemo(
    () => prompts.map((p) => sanitizePromptLineText(p.text)).filter(Boolean).join("\n"),
    [prompts]
  );
  const categoriesText = useMemo(
    () =>
      prompts
        .filter((p) => p.text.trim().length > 0)
        .map((p) => p.category ?? "")
        .join("\n"),
    [prompts]
  );
  const validCompetitorCount = competitorsText ? competitorsText.split("\n").length : 0;
  const validPromptCount = promptsText ? promptsText.split("\n").length : 0;
  const promptRoomLeft = Math.max(0, promptCap - prompts.length);
  const generateMoreCount = Math.min(GENERATE_MORE_BATCH_SIZE, promptRoomLeft);

  // Reparto real de los prompts por categoría, para el panel de cobertura del
  // paso 3 — cuenta el propio estado, nunca un número inventado. Ordenado de
  // mayor a menor para que las barras escalen contra el máximo real.
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of prompts) {
      if (!sanitizePromptLineText(p.text)) continue;
      const key = p.category ?? "Sin categoría";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [prompts]);

  function generateSuggestions() {
    if (atLimit) return;
    if (!domainIsValid) {
      setShowDomainErr(true);
      return;
    }
    setShowDomainErr(false);
    setSuggestError(null);
    setSuggestFailed([]);
    startTransition(async () => {
      const result = await suggestAction({ domain, country });
      if (!result.ok) {
        setSuggestError(
          "No hemos podido sugerir competidores ni prompts para este dominio. Puedes añadirlos manualmente y continuar."
        );
        setSuggestFailed(result.failed.length ? result.failed : ["competitors", "prompts"]);
        setCompetitors([{ id: newId(), name: "", domain: "", source: "manual" }]);
        setPrompts([{ id: newId(), text: "", category: null }]);
        setLanguage((current) => result.language || current);
        setStep(1);
        return;
      }
      setLanguage(result.language || language);
      setSuggestFailed(result.failed);
      setCompetitors(
        result.competitors.length
          ? result.competitors.map((c) => ({ id: newId(), ...c, source: "suggested" as const }))
          : [{ id: newId(), name: "", domain: "", source: "manual" }]
      );
      setPrompts(
        result.prompts.length
          ? result.prompts.map((p) => ({ id: newId(), ...p }))
          : [{ id: newId(), text: "", category: null }]
      );
      setStep(1);
    });
  }

  function updateCompetitor(index: number, patch: Partial<Competitor>) {
    setCompetitors((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }
  function updatePrompt(index: number, value: string) {
    setPrompts((rows) => rows.map((row, i) => (i === index ? { ...row, text: value } : row)));
  }

  // "Generar N más" (prompts step): asks Gemini for a handful of new prompts
  // distinct from what's already listed (generateMorePromptsAction ->
  // generateAddedPrompts, same call the post-creation "Añadir prompts" flow
  // uses), then appends up to however many slots remain under the plan cap.
  function generateMorePromptsAutomatically() {
    if (promptRoomLeft <= 0 || isGeneratingMore) return;
    setGenerateMoreError(null);
    startGenerateMoreTransition(async () => {
      const existingPromptTexts = prompts.map((p) => sanitizePromptLineText(p.text)).filter(Boolean);
      const existingCategories = prompts.map((p) => p.category ?? "").filter(Boolean);
      const result = await generateMorePromptsAction({ domain, country, existingPromptTexts, existingCategories });

      if (!result.ok) {
        setGenerateMoreError(
          "No hemos podido generar más prompts ahora mismo. Puedes reintentarlo o añadir uno manualmente."
        );
        return;
      }

      setPrompts((rows) => {
        const room = Math.max(0, promptCap - rows.length);
        const toAdd = result.prompts.slice(0, room);
        return [...rows, ...toAdd.map((p) => ({ id: newId(), text: p.text, category: p.category }))];
      });
    });
  }

  const stepsBar = <WizardSteps currentStep={step} />;

  if (step === 0) {
    return (
      <div className="page onb2-scope onb2-page fade-in">
        <div className="onb2-crumb">
          <Icon name="plus" size={13} />
          Nuevo dominio
        </div>

        <div className="onb2-head">
          <div>
            <h1 className="onb2-h1">{isPending ? `Leyendo ${domain || "tu dominio"}` : "Añade un dominio"}</h1>
            <p className="onb2-sub">
              {isPending
                ? "Buscamos con quién compites y qué te preguntarían de verdad en un chat de IA. Unos 15 segundos — no cierres ni recargues esta pestaña."
                : "Lo leemos, te proponemos competidores y prompts, y lanzamos el primer escaneo en los tres motores."}
            </p>
          </div>
          {stepsBar}
        </div>

        {errorMessage ? <p className="feedback error">{errorMessage}</p> : null}

        <div className="onb2-grid">
          <div>
            {isPending ? (
              <DomainAnalyzingCard domain={domain} />
            ) : (
              <div className="card onb2-cpad">
                <label className="field-label" htmlFor="domain">
                  Dominio
                </label>
                <div className="domain-bar">
                  <Icon name="globe" size={18} className="domain-globe" />
                  <input
                    id="domain"
                    name="domain"
                    className="domain-input"
                    value={domain}
                    onChange={(event) => {
                      setDomain(event.target.value);
                      setShowDomainErr(false);
                    }}
                    onFocus={() => setIsDomainFocused(true)}
                    onBlur={() => setIsDomainFocused(false)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        generateSuggestions();
                      }
                    }}
                    placeholder={isDomainFocused || domain ? "introduce tu dominio" : ""}
                    aria-label="Dominio"
                    aria-describedby="domain-help"
                    spellCheck={false}
                    autoFocus
                  />
                  {!isDomainFocused && domain === "" ? (
                    <span className="db-ghost">
                      {typedPlaceholder}
                      <span className="type-caret" />
                    </span>
                  ) : null}
                  <div className="country-sel" title="País de análisis">
                    <Flag code={selectedCountry.code.toLowerCase()} />
                    <span
                      className="country-sel-name"
                      style={{ maxWidth: 96, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    >
                      {selectedCountry.name}
                    </span>
                    <Icon name="chevDown" size={14} className="text-[var(--ink-4)]" />
                    <select
                      id="country"
                      value={country}
                      onChange={(event) => setCountry(event.target.value)}
                      aria-label="País de análisis"
                    >
                      {COUNTRIES.map((option) => (
                        <option key={option.code} value={option.code}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button type="button" className="onb-cta" onClick={generateSuggestions} disabled={isPending || atLimit}>
                    {isPending ? "Generando…" : "Continuar"}
                    <Icon name="arrRight" size={16} />
                  </Button>
                </div>
                <p id="domain-help" className="sr-only">
                  Escribe solo el dominio, sin https:// ni rutas. Ejemplo: miempresa.com
                </p>
                {showDomainErr && domainHasValue && !domainIsValid ? (
                  <div className="field-err" style={{ justifyContent: "flex-start" }}>
                    <Icon name="alertCircle" size={14} />
                    Introduce un dominio válido, p. ej. miempresa.com
                  </div>
                ) : (
                  <div className="add-hint">
                    <Icon name="info" size={13} className="add-hint-ico" />
                    <span>El idioma se detecta automáticamente del dominio. Podrás añadir competidores y prompts después.</span>
                  </div>
                )}
                {suggestError ? <p className="feedback error mt-2">{suggestError}</p> : null}

                <div className="add-engines">
                  <span className="cap">Motores</span>
                  {ENGINE_PROVIDERS.map((provider) => {
                    const meta = getEngineMeta(provider);
                    return (
                      <span className="eng-chip" key={provider}>
                        <span className="eng-ico" style={{ color: meta.color }}>
                          <EngineGlyph provider={provider} />
                        </span>
                        {meta.label}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <LaunchSummaryPanel
            domain={domain}
            languageKnown={false}
            language={language}
            engineCount={ENGINE_PROVIDERS.length}
            competitorsCount={null}
            promptsCount={null}
          />
        </div>
      </div>
    );
  }

  if (step === 1) {
    return (
      <div className="page onb2-scope onb2-page fade-in">
        <button type="button" className="onb2-back" onClick={() => setStep(0)}>
          <Icon name="chevLeft" size={14} />
          Volver al dominio
        </button>

        <div className="onb2-head">
          <div>
            <h1 className="onb2-h1">Tus competidores</h1>
            <p className="onb2-sub">
              Analizamos{" "}
              <b style={{ color: "var(--ink-2)", fontFamily: "var(--mono)", fontWeight: 600 }}>
                {domain || "tu dominio"}
              </b>{" "}
              e identificamos tus principales competidores para monitorizar cómo te comparas en las respuestas de
              IA. Si algo no encaja, edítalo o elimínalo.
            </p>
          </div>
          {stepsBar}
        </div>

        {errorMessage ? <p className="feedback error">{errorMessage}</p> : null}
        {suggestFailed.includes("competitors") ? <SuggestionGapNotice kind="competitors" /> : null}

        <div className="onb2-grid">
          <div>
            <div className="onb2-seclbl">
              {validCompetitorCount} competidor{validCompetitorCount === 1 ? "" : "es"} (máximo {MAX_USER_COMPETITORS})
            </div>
            <div className="card" style={{ overflow: "hidden" }}>
              {competitors.map((row, index) => {
                const isOpen = openCompetitors.has(row.id);
                return (
                  <div key={row.id} className={isOpen ? "onb2-row align-top" : "onb2-row"}>
                    <span
                      className="onb2-fav"
                      style={{ background: AVATAR_COLORS[index % AVATAR_COLORS.length] }}
                      aria-hidden="true"
                    >
                      {(row.name.trim()[0] || row.domain.trim()[0] || "?").toUpperCase()}
                    </span>
                    {isOpen ? (
                      <div className="onb2-editgrid">
                        <Input
                          aria-label={`Nombre competidor ${index + 1}`}
                          placeholder="Nombre"
                          value={row.name}
                          onChange={(event) => updateCompetitor(index, { name: event.target.value })}
                          autoFocus
                        />
                        <Input
                          aria-label={`Dominio competidor ${index + 1}`}
                          placeholder="dominio.com"
                          value={row.domain}
                          onChange={(event) => updateCompetitor(index, { domain: event.target.value })}
                        />
                      </div>
                    ) : (
                      <span className="onb2-rmeta-static">
                        <span className="onb2-rname">{row.name || "Sin nombre"}</span>
                        <span className="onb2-rdom">{row.domain || "sin dominio"}</span>
                      </span>
                    )}
                    {row.source === "suggested" ? (
                      <span className="onb2-chip">
                        <Icon name="sparkles" size={11} />
                        sugerido
                      </span>
                    ) : null}
                    <button
                      type="button"
                      className="onb2-iconbtn"
                      aria-label={isOpen ? `Listo, competidor ${index + 1}` : `Editar competidor ${index + 1}`}
                      onClick={() => toggleId(setOpenCompetitors, row.id)}
                    >
                      <Icon name={isOpen ? "check" : "settings"} size={14} />
                    </button>
                    <button
                      type="button"
                      className="onb2-iconbtn"
                      aria-label={`Quitar competidor ${index + 1}`}
                      onClick={() => setCompetitors((rows) => rows.filter((_, i) => i !== index))}
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                );
              })}
              <div className="onb2-listfoot">
                <Button
                  type="button"
                  variant="outline"
                  disabled={competitors.length >= MAX_USER_COMPETITORS}
                  onClick={() => {
                    const id = newId();
                    setCompetitors((rows) =>
                      rows.length >= MAX_USER_COMPETITORS ? rows : [...rows, { id, name: "", domain: "", source: "manual" }]
                    );
                    setOpenCompetitors((prev) => new Set(prev).add(id));
                  }}
                >
                  <Icon name="plus" size={13} />
                  Añadir competidor
                </Button>
                <span style={{ fontSize: 12, color: "var(--ink-4)" }}>Podrás cambiarlos cuando quieras.</span>
              </div>
            </div>

            <div className="onb2-foot">
              <Button type="button" variant="outline" onClick={() => setStep(0)}>
                Atrás
              </Button>
              <Button type="button" onClick={() => setStep(2)} className="inline-flex items-center gap-2">
                Continuar a prompts
                <Icon name="arrRight" size={16} />
              </Button>
            </div>
          </div>

          <LaunchSummaryPanel
            domain={domain}
            languageKnown
            language={language}
            engineCount={ENGINE_PROVIDERS.length}
            competitorsCount={validCompetitorCount}
            promptsCount={null}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="page onb2-scope onb2-page fade-in">
      <button type="button" className="onb2-back" onClick={() => setStep(1)}>
        <Icon name="chevLeft" size={14} />
        Volver a competidores
      </button>

      <div className="onb2-head">
        <div>
          <h1 className="onb2-h1">Revisa tus prompts</h1>
          <p className="onb2-sub">
            Cada prompt se lanza a los tres motores. Quita los que no te representen — recomendamos al menos{" "}
            <b style={{ color: "var(--ink-2)" }}>15</b> para obtener mejores datos.
          </p>
        </div>
        {stepsBar}
      </div>

      {errorMessage ? <p className="feedback error">{errorMessage}</p> : null}
      {suggestFailed.includes("prompts") ? <SuggestionGapNotice kind="prompts" /> : null}

      <div className="onb2-grid">
        <form action={createAction}>
          <input type="hidden" name="domain" value={domain} />
          <input type="hidden" name="country" value={country} />
          <input type="hidden" name="language" value={language} />
          <input type="hidden" name="initial_competitors" value={competitorsText} />
          <input type="hidden" name="initial_prompts" value={promptsText} />
          <input type="hidden" name="initial_prompt_categories" value={categoriesText} />
          <PromptsStepBody
            prompts={prompts}
            promptCap={promptCap}
            validPromptCount={validPromptCount}
            promptRoomLeft={promptRoomLeft}
            generateMoreCount={generateMoreCount}
            categoryCounts={categoryCounts}
            isGeneratingMore={isGeneratingMore}
            generateMoreError={generateMoreError}
            openPrompts={openPrompts}
            toggleOpenPrompt={(id) => toggleId(setOpenPrompts, id)}
            updatePrompt={updatePrompt}
            removePrompt={(index) => setPrompts((rows) => rows.filter((_, i) => i !== index))}
            addPrompt={() => {
              const id = newId();
              setPrompts((rows) => (rows.length >= promptCap ? rows : [...rows, { id, text: "", category: null }]));
              setOpenPrompts((prev) => new Set(prev).add(id));
            }}
            generateMorePromptsAutomatically={generateMorePromptsAutomatically}
            goBack={() => setStep(1)}
          />
        </form>

        <LaunchSummaryPanel
          domain={domain}
          languageKnown
          language={language}
          engineCount={ENGINE_PROVIDERS.length}
          competitorsCount={validCompetitorCount}
          promptsCount={validPromptCount}
        />
      </div>
    </div>
  );
}
