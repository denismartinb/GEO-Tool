"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Icon } from "@/components/ui/icon";
import type { ProjectSetupSuggestion } from "@/app/dashboard/projects/actions";
import type { PromptCategory } from "@/lib/projects/prompt-categories";

// Recomendación de volumen del set de prompts (Fase D) — coincide con el
// límite máximo de sugerencias iniciales (MAX_INITIAL_PROMPTS en
// lib/projects/project-form.ts) y con el copy "recomendamos al menos 15".
const RECOMMENDED_PROMPT_COUNT = 15;

// Tono de badge por categoría de prompt (lib/projects/prompt-categories.ts),
// adaptando el INTENT_TONE del diseño (Comercial/Informacional/Transaccional)
// a la taxonomía real del producto.
const CATEGORY_TONE: Record<PromptCategory, "accent" | "neutral" | "warn"> = {
  Comparación: "accent",
  Alternativas: "accent",
  "Cómo hacer / guía": "neutral",
  "Precio y planes": "warn",
  "Reseñas y opiniones": "neutral",
  "Casos de uso": "neutral"
};

// Colores de avatar (cs-fav) para competidores, ciclando como en el diseño
// (COMP_COLORS de competitor-setup.jsx).
const COMPETITOR_COLORS = ["#6366f1", "#0e9488", "#d9772b", "#9333a8", "#3b6fd6", "#0891b2", "#15915a", "#c026d3"];

function brandFromDomain(domain: string): string {
  const base = (domain || "tu-marca")
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(".")[0];
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : "Tú";
}

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

const ENGINES = [
  { name: "ChatGPT", color: "#10a37f" },
  { name: "Google AI Overviews", color: "#4285f4" },
  { name: "Perplexity", color: "#20b8cd" },
  { name: "Claude", color: "#d97757" }
];

const ADD_STEPS = [
  { icon: "search", t: "Analizamos", d: "Leemos tu dominio y lanzamos tus prompts en 4 motores de IA." },
  { icon: "competitors", t: "Comparamos", d: "Medimos tu visibilidad frente a tus competidores." },
  { icon: "recs", t: "Recomendamos", d: "Recibes un plan de acciones priorizadas por impacto." }
];

const wizardSteps = [
  { label: "Dominio", description: "Dominio y mercado" },
  { label: "Competidores", description: "Sugeridos, editables" },
  { label: "Prompts", description: "Sugeridos, editables" }
];

type Competitor = { name: string; domain: string };

function isValidDomain(value: string) {
  const domain = value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");

  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(domain);
}

// Pequeño typewriter para el placeholder del input de dominio.
// Port literal de onboarding.jsx líneas 21-47 (estado/efectos puros de React).
function useTypewriter(words: string[], active: boolean) {
  const [txt, setTxt] = useState("");
  const st = useRef({ w: 0, c: 0, del: false });
  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const s = st.current;
      const word = words[s.w % words.length];
      if (!s.del) {
        s.c++;
        setTxt(word.slice(0, s.c));
        if (s.c >= word.length) {
          s.del = true;
          timer = setTimeout(tick, 1400);
          return;
        }
        timer = setTimeout(tick, 95);
      } else {
        s.c--;
        setTxt(word.slice(0, s.c));
        if (s.c <= 0) {
          s.del = false;
          s.w++;
          timer = setTimeout(tick, 280);
          return;
        }
        timer = setTimeout(tick, 45);
      }
    };
    timer = setTimeout(tick, 600);
    return () => clearTimeout(timer);
  }, [active, words]);
  return txt;
}

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

// Stepper visual del wizard — markup/clases literales de onboarding.jsx
// (.wiz-steps/.wiz-step/.ws-dot/.ws-l/.wiz-sep), reemplazando el Stepper
// genérico solo en este flujo.
function WizardSteps({ currentStep }: { currentStep: number }) {
  return (
    <div className="wiz-steps">
      {wizardSteps.map((s, index) => (
        <div key={s.label} style={{ display: "contents" }}>
          {index > 0 ? <span className="wiz-sep" /> : null}
          <div className={index === currentStep ? "wiz-step on" : index < currentStep ? "wiz-step done" : "wiz-step"}>
            <span className="ws-dot">
              {index < currentStep ? <Icon name="check" size={12} /> : index + 1}
            </span>
            <span className="ws-l">{s.label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// Estado de carga del envío final. `useFormStatus` solo funciona en un
// componente hijo del <form> — por eso vive aparte de OnboardingWizard.
// Sin barra de progreso falsa: en este punto el proyecto/scan aún no existen
// en el cliente, así que no hay datos reales que mostrar (ver scan-in-progress.tsx).
function CreateProjectOverlay() {
  const { pending } = useFormStatus();
  if (!pending) return null;
  return (
    <div className="state-wrap fade-in" style={{ position: "fixed", inset: 0, zIndex: 80, background: "var(--canvas)" }}>
      <div className="state-card">
        <div className="state-ico">
          <div className="spinner" style={{ width: 26, height: 26, borderWidth: 3 }} />
        </div>
        <div className="state-title">Creando tu dominio…</div>
        <div className="state-body">
          Guardando tus prompts y competidores. En unos segundos te llevamos a Escaneos para
          ver el primer escaneo en curso.
        </div>
      </div>
    </div>
  );
}

// Estado de carga al sugerir competidores y prompts con Gemini (paso 0 → 1).
// Mismo patrón visual que CreateProjectOverlay: overlay fijo con spinner y
// copy honesto, sin progreso falso (la llamada es opaca).
function SuggestionsLoadingOverlay() {
  return (
    <div className="state-wrap fade-in" style={{ position: "fixed", inset: 0, zIndex: 80, background: "var(--canvas)" }}>
      <div className="state-card">
        <div className="state-ico">
          <div className="spinner" style={{ width: 26, height: 26, borderWidth: 3 }} />
        </div>
        <div className="state-title">Analizando tu dominio…</div>
        <div className="state-body">
          Estamos sugiriendo competidores y prompts relevantes con IA. Esto puede tardar
          hasta 15 segundos — no cierres ni recargues esta pestaña.
        </div>
      </div>
    </div>
  );
}

type OnboardingWizardProps = {
  errorMessage: string | null;
  suggestAction: (input: { domain: string; country: string }) => Promise<ProjectSetupSuggestion>;
  createAction: (formData: FormData) => void | Promise<void>;
};

export function OnboardingWizard({ errorMessage, suggestAction, createAction }: OnboardingWizardProps) {
  const [step, setStep] = useState(0);
  const [domain, setDomain] = useState("");
  const [country, setCountry] = useState("ES");
  const [language, setLanguage] = useState("es");
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [prompts, setPrompts] = useState<Array<{ text: string; category: PromptCategory | null; selected: boolean }>>([]);
  const [promptDraft, setPromptDraft] = useState("");
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isDomainFocused, setIsDomainFocused] = useState(false);
  const [showDomainErr, setShowDomainErr] = useState(false);

  const domainHasValue = domain.trim().length > 0;
  const domainIsValid = isValidDomain(domain);
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
  // Solo los prompts seleccionados (y con texto) se envían al servidor.
  const selectedPrompts = useMemo(
    () => prompts.filter((p) => p.selected && p.text.trim().length > 0),
    [prompts]
  );
  const promptsText = useMemo(() => selectedPrompts.map((p) => p.text.trim()).join("\n"), [selectedPrompts]);
  const categoriesText = useMemo(
    () => selectedPrompts.map((p) => p.category ?? "").join("\n"),
    [selectedPrompts]
  );
  const selectedPromptCount = selectedPrompts.length;

  function generateSuggestions() {
    if (!domainIsValid) {
      setShowDomainErr(true);
      return;
    }
    setShowDomainErr(false);
    setSuggestError(null);
    startTransition(async () => {
      const result = await suggestAction({ domain, country });
      if (!result.ok) {
        setSuggestError(
          "No hemos podido sugerir competidores ni prompts para este dominio. Puedes añadirlos manualmente y continuar."
        );
        setCompetitors([{ name: "", domain: "" }]);
        setPrompts([{ text: "", category: null, selected: true }]);
        setLanguage((current) => result.language || current);
        setStep(1);
        return;
      }
      setLanguage(result.language || language);
      setCompetitors(result.competitors.length ? result.competitors : [{ name: "", domain: "" }]);
      setPrompts(
        result.prompts.length
          ? result.prompts.map((p) => ({ ...p, selected: true }))
          : [{ text: "", category: null, selected: true }]
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
  function togglePrompt(index: number) {
    setPrompts((rows) => rows.map((row, i) => (i === index ? { ...row, selected: !row.selected } : row)));
  }
  const allPromptsSelected = prompts.length > 0 && prompts.every((row) => row.selected);
  function toggleAllPrompts() {
    setPrompts((rows) => rows.map((row) => ({ ...row, selected: !allPromptsSelected })));
  }
  function addPromptDraft() {
    const value = promptDraft.trim();
    if (!value) return;
    setPrompts((rows) => (rows.length >= 15 ? rows : [{ text: value, category: null, selected: true }, ...rows]));
    setPromptDraft("");
  }

  if (step === 0) {
    return (
      <div className="page add-domain fade-in">
        {isPending ? <SuggestionsLoadingOverlay /> : null}
        <Link href="/dashboard" className="add-back">
          <Icon name="chevLeft" size={15} />
          Volver a Escaneos
        </Link>
        <div className="add-wrap">
          <div className="add-hero">
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
              <WizardSteps currentStep={step} />
            </div>
            <span className="onb-eyebrow">
              <Icon name="plus" size={14} />
              Nuevo dominio
            </span>
            <h1 className="add-h1">
              Añade un dominio para <span className="grad">monitorizar</span>
            </h1>
            <p className="add-sub">
              Introduce el dominio y el país de análisis. Lanzaremos un primer escaneo de visibilidad en los
              principales motores de IA.
            </p>
          </div>

          {errorMessage ? <p className="feedback error">{errorMessage}</p> : null}

          <div className="add-card">
            <div className="add-aurora">
              <div className="blob blob-1" />
              <div className="blob blob-3" />
            </div>
            <div className="add-card-inner">
              <label className="field-label" htmlFor="domain">
                Dominio del proyecto
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
                  <span className="country-sel-name" style={{ maxWidth: 96, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
                <Button type="button" className="onb-cta" onClick={generateSuggestions} disabled={isPending}>
                  {isPending ? "Generando…" : "Continuar"}
                  <Icon name="arrRight" size={16} />
                </Button>
              </div>
              <p id="domain-help" className="sr-only">
                Escribe solo el dominio, sin https:// ni rutas. Ejemplo: lumira.ai
              </p>
              {showDomainErr && domainHasValue && !domainIsValid ? (
                <div className="field-err" style={{ justifyContent: "flex-start" }}>
                  <Icon name="alertCircle" size={14} />
                  Introduce un dominio válido, p. ej. miempresa.com
                </div>
              ) : (
                <div className="add-hint">
                  <Icon name="info" size={13} />
                  El idioma se detecta automáticamente del dominio. Podrás añadir competidores y prompts después.
                </div>
              )}
              {suggestError ? <p className="feedback error mt-2">{suggestError}</p> : null}

              <div className="add-engines">
                <span className="cap">Motores incluidos</span>
                {ENGINES.map((engine) => (
                  <span className="eng-chip" key={engine.name}>
                    <span className="eng-dot" style={{ background: engine.color }} />
                    {engine.name}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="add-steps">
            {ADD_STEPS.map((s, i) => (
              <div className="add-step" key={s.t}>
                <div className="as-ico">
                  <Icon name={s.icon} size={17} />
                </div>
                <div>
                  <div className="as-t">
                    {i + 1}. {s.t}
                  </div>
                  <div className="as-d">{s.d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (step === 1) {
    return (
      <div className="page add-domain fade-in">
        <button type="button" className="add-back" onClick={() => setStep(0)}>
          <Icon name="chevLeft" size={15} />
          Volver al dominio
        </button>

        <div className="add-wrap">
          <div className="cs-headwrap">
            <div style={{ display: "flex", justifyContent: "center" }}>
              <WizardSteps currentStep={step} />
            </div>
            <h1 className="add-h1" style={{ marginTop: 18 }}>
              Tus competidores
            </h1>
            <p className="add-sub" style={{ margin: "10px 0 0" }}>
              Analizamos{" "}
              <b style={{ color: "var(--ink-2)", fontFamily: "var(--mono)", fontWeight: 600 }}>
                {domain || "tu dominio"}
              </b>{" "}
              e identificamos tus principales competidores para monitorizar cómo te comparas en las respuestas de
              IA. Si algo no encaja, edítalo o elimínalo.
            </p>
          </div>

          {errorMessage ? <p className="feedback error">{errorMessage}</p> : null}

          <div className="cs-layout">
            {/* editor */}
            <div>
              <div className="cs-list-head">
                <span></span>
                <span>Marca</span>
                <span>Dominio</span>
                <span></span>
              </div>
              <div className="cs-list">
                {competitors.map((row, index) => {
                  const initial = (row.name.trim()[0] || "?").toUpperCase();
                  const color = COMPETITOR_COLORS[index % COMPETITOR_COLORS.length];
                  return (
                    <div key={index} className="cs-row grid grid-cols-2 gap-2 sm:grid-cols-[34px_1fr_190px_36px]">
                      <span
                        className="cs-fav col-span-2 sm:col-auto"
                        style={{
                          background: row.name.trim() ? color : "var(--surface-sunk)",
                          color: row.name.trim() ? "#fff" : "var(--ink-4)"
                        }}
                      >
                        {initial}
                      </span>
                      <Input
                        aria-label={`Nombre competidor ${index + 1}`}
                        placeholder="Nombre de la marca"
                        value={row.name}
                        onChange={(event) => updateCompetitor(index, { name: event.target.value })}
                      />
                      <Input
                        aria-label={`Dominio competidor ${index + 1}`}
                        placeholder="dominio.com"
                        className="font-mono"
                        value={row.domain}
                        onChange={(event) => updateCompetitor(index, { domain: event.target.value })}
                      />
                      <button
                        type="button"
                        className="cs-del col-span-2 sm:col-auto"
                        title="Eliminar competidor"
                        aria-label={`Eliminar competidor ${index + 1}`}
                        onClick={() => setCompetitors((rows) => rows.filter((_, i) => i !== index))}
                      >
                        <Icon name="x" size={15} />
                      </button>
                    </div>
                  );
                })}
                {competitors.length === 0 ? (
                  <div className="cs-empty">No hay competidores. Añade al menos uno para comparar tu visibilidad.</div>
                ) : null}
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ marginTop: 12 }}
                onClick={() => setCompetitors((rows) => [...rows, { name: "", domain: "" }])}
              >
                <Icon name="plus" size={14} />
                Añadir competidor
              </button>
              <div className="cs-tip">
                <Icon name="info" size={13} />
                Monitorizaremos cada competidor en los mismos prompts y motores que tu marca.
              </div>
            </div>

            {/* ranking preview */}
            <div className="cs-rank card">
              <div className="card-head">
                <div className="card-title">Ranking de marcas</div>
                <span className="badge badge-neutral">Vista previa</span>
              </div>
              <div className="rank-head">
                <span className="c">#</span>
                <span>Marca</span>
                <span className="c">Sentim.</span>
                <span className="c">Menciones</span>
                <span className="c">Cobert.</span>
              </div>
              <div className="rank-body">
                {(() => {
                  const brandName = brandFromDomain(domain);
                  const ranking = [
                    { name: brandName, you: true, color: "#6366f1", initial: (brandName[0] || "T").toUpperCase() },
                    ...competitors
                      .filter((c) => c.name.trim())
                      .map((c, index) => ({
                        name: c.name.trim(),
                        you: false,
                        color: COMPETITOR_COLORS[index % COMPETITOR_COLORS.length],
                        initial: (c.name.trim()[0] || "?").toUpperCase()
                      }))
                  ];
                  return ranking.map((r, i) => (
                    <div className={`rank-row${r.you ? " you" : ""}`} key={i}>
                      <span className="c rk-n">{i + 1}</span>
                      <span className="rk-ent">
                        <span className="cs-fav sm" style={{ background: r.color }}>
                          {r.initial}
                        </span>
                        <span className="rk-nm">
                          {r.name}
                          {r.you ? <span className="rk-you">Tú</span> : null}
                        </span>
                      </span>
                      <span className="c">
                        <i className="rk-ph" />
                      </span>
                      <span className="c">
                        <i className="rk-ph" />
                      </span>
                      <span className="c">
                        <i className="rk-ph" />
                      </span>
                    </div>
                  ));
                })()}
              </div>
              <div className="cs-rank-foot">
                <Icon name="clock" size={13} />
                Las métricas se calcularán tras el primer escaneo.
              </div>
            </div>
          </div>

          <div className="cs-foot">
            <Button type="button" variant="outline" onClick={() => setStep(0)}>
              <Icon name="chevLeft" size={16} />
              Atrás
            </Button>
            <Button type="button" onClick={() => setStep(2)} className="inline-flex items-center gap-2">
              Continuar a prompts
              <Icon name="arrRight" size={16} />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page add-domain cs-page fade-in">
      <button type="button" className="add-back" onClick={() => setStep(1)}>
        <Icon name="chevLeft" size={15} />
        Volver a competidores
      </button>

      <div className="add-wrap">
        <div className="cs-headwrap" style={{ textAlign: "center", margin: "0 auto 22px" }}>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <WizardSteps currentStep={step} />
          </div>
          <h1 className="add-h1" style={{ marginTop: 18, fontSize: 30 }}>
            Revisa y selecciona tus prompts
          </h1>
          <p className="add-sub" style={{ margin: "10px auto 0" }}>
            Estos son los prompts que hemos generado para{" "}
            <b style={{ color: "var(--ink-2)", fontFamily: "var(--mono)", fontWeight: 600 }}>
              {domain || "tu dominio"}
            </b>
            . Selecciona los que quieras monitorizar — recomendamos al menos{" "}
            <b style={{ color: "var(--ink-2)" }}>15</b> para obtener mejores datos.
          </p>
        </div>

        {errorMessage ? <p className="feedback error">{errorMessage}</p> : null}

        <div className="cs-layout">
          {/* lista */}
          <div>
            {/* añadir */}
            <div className="ps-add">
              <Icon name="plus" size={16} className="text-[var(--ink-4)]" />
              <input
                className="ps-add-input"
                value={promptDraft}
                onChange={(event) => setPromptDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addPromptDraft();
                  }
                }}
                placeholder="Añade tu propio prompt…"
                aria-label="Añadir nuevo prompt"
                spellCheck={false}
              />
              <button
                type="button"
                className="btn btn-soft btn-sm"
                onClick={addPromptDraft}
                disabled={!promptDraft.trim() || prompts.length >= 15}
              >
                Añadir
              </button>
            </div>

            <div className="ps-listhead">
              <button type="button" className="ps-selall" onClick={toggleAllPrompts}>
                <span className={`ps-check${allPromptsSelected ? " on" : ""}`}>
                  {allPromptsSelected ? <Icon name="check" size={12} /> : null}
                </span>
                Seleccionar todo
              </button>
              <span className="ps-count">
                <b>{selectedPromptCount}</b>/{prompts.length} seleccionados
              </span>
            </div>

            <div className="ps-list">
              {prompts.map((row, index) => (
                <div
                  key={index}
                  className={`ps-row${row.selected ? " on" : ""}`}
                  onClick={() => togglePrompt(index)}
                  role="checkbox"
                  aria-checked={row.selected}
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      togglePrompt(index);
                    }
                  }}
                >
                  <span className={`ps-check${row.selected ? " on" : ""}`}>
                    {row.selected ? <Icon name="check" size={12} /> : null}
                  </span>
                  <div className="space-y-1" onClick={(event) => event.stopPropagation()}>
                    <Textarea
                      aria-label={`Prompt ${index + 1}`}
                      rows={2}
                      className="onb-prompt-input"
                      placeholder="Ej. ¿Cuáles son las mejores herramientas para…?"
                      value={row.text}
                      onChange={(event) => updatePrompt(index, event.target.value)}
                    />
                  </div>
                  <span className={`badge badge-${row.category ? CATEGORY_TONE[row.category] : "neutral"}`}>
                    {row.category ?? "Personalizado"}
                  </span>
                  <button
                    type="button"
                    className="ps-del"
                    title="Eliminar prompt"
                    aria-label={`Eliminar prompt ${index + 1}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setPrompts((rows) => rows.filter((_, i) => i !== index));
                    }}
                  >
                    <Icon name="x" size={14} />
                  </button>
                </div>
              ))}
              {prompts.length === 0 ? (
                <div className="cs-empty">No hay prompts. Añade al menos uno para empezar.</div>
              ) : null}
            </div>
          </div>

          {/* resumen */}
          <div className="cs-rank card" style={{ position: "sticky", top: 8 }}>
            <div className="card-head">
              <div className="card-title">Resumen del set</div>
            </div>
            <div className="card-pad">
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span className="tnum" style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-.02em", color: "var(--accent)" }}>
                  {selectedPromptCount}
                </span>
                <span style={{ fontSize: 14, color: "var(--ink-3)", fontWeight: 600 }}>prompts seleccionados</span>
              </div>
              <div className="ps-prog">
                <div className="ps-prog-track">
                  <div
                    className="ps-prog-fill"
                    style={{
                      width: `${Math.min(100, Math.round((selectedPromptCount / RECOMMENDED_PROMPT_COUNT) * 100))}%`,
                      background: selectedPromptCount >= RECOMMENDED_PROMPT_COUNT ? "var(--pos)" : "var(--accent)"
                    }}
                  />
                </div>
                <div className="ps-prog-l">
                  {selectedPromptCount >= RECOMMENDED_PROMPT_COUNT ? (
                    <span style={{ color: "var(--pos-ink)", fontWeight: 650 }}>
                      <Icon name="check" size={12} /> Listo — buen volumen para datos fiables
                    </span>
                  ) : (
                    <span>
                      Añade {RECOMMENDED_PROMPT_COUNT - selectedPromptCount} más para alcanzar el mínimo recomendado (
                      {RECOMMENDED_PROMPT_COUNT})
                    </span>
                  )}
                </div>
              </div>

              <div className="ps-sum-row">
                <Icon name="layers" size={15} />
                <span>
                  Se consultarán en <b>4 motores</b> de IA
                </span>
              </div>
              <div className="ps-sum-row">
                <Icon name="competitors" size={15} />
                <span>
                  Comparados con tus <b>competidores</b>
                </span>
              </div>
              <div className="ps-sum-row">
                <Icon name="clock" size={15} />
                <span>
                  Re-escaneo <b>semanal</b> automático disponible (activable después)
                </span>
              </div>

              <div className="why" style={{ marginTop: 16 }}>
                <Icon name="help" size={16} />
                <div>
                  <div className="why-t">¿Qué es un prompt?</div>
                  <div className="why-b">
                    Es una pregunta que tus clientes podrían hacer a una IA. Monitorizamos si tu marca aparece en la
                    respuesta.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <form action={createAction} className="cs-foot">
          <input type="hidden" name="domain" value={domain} />
          <input type="hidden" name="country" value={country} />
          <input type="hidden" name="language" value={language} />
          <input type="hidden" name="initial_competitors" value={competitorsText} />
          <input type="hidden" name="initial_prompts" value={promptsText} />
          <input type="hidden" name="initial_prompt_categories" value={categoriesText} />
          <CreateProjectOverlay />
          <Button type="button" variant="outline" onClick={() => setStep(1)}>
            <Icon name="chevLeft" size={16} />
            Atrás
          </Button>
          <Button type="submit" disabled={selectedPromptCount === 0} className="inline-flex items-center gap-2">
            Empezar a monitorizar
            <Icon name="arrRight" size={16} />
          </Button>
        </form>
      </div>
    </div>
  );
}
