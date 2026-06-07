"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Icon } from "@/components/ui/icon";
import type { ProjectSetupSuggestion } from "@/app/dashboard/projects/actions";

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
            <span className="ws-dot">{index + 1}</span>
            <span className="ws-l">{s.label}</span>
          </div>
        </div>
      ))}
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
  const [prompts, setPrompts] = useState<string[]>([]);
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
  const promptsText = useMemo(() => prompts.map((p) => p.trim()).filter(Boolean).join("\n"), [prompts]);
  const validCompetitorCount = competitorsText ? competitorsText.split("\n").length : 0;
  const validPromptCount = promptsText ? promptsText.split("\n").length : 0;

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
        setPrompts([""]);
        setLanguage((current) => result.language || current);
        setStep(1);
        return;
      }
      setLanguage(result.language || language);
      setCompetitors(result.competitors.length ? result.competitors : [{ name: "", domain: "" }]);
      setPrompts(result.prompts.length ? result.prompts : [""]);
      setStep(1);
    });
  }

  function updateCompetitor(index: number, patch: Partial<Competitor>) {
    setCompetitors((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }
  function updatePrompt(index: number, value: string) {
    setPrompts((rows) => rows.map((row, i) => (i === index ? value : row)));
  }

  if (step === 0) {
    return (
      <div className="page add-domain fade-in">
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
                  <span style={{ maxWidth: 96, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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

  return (
    <div className="page mx-auto max-w-4xl space-y-4">
      <p className="kicker">Dominios</p>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="title-lg">Nuevo dominio</h1>
          <p className="sub mt-1">Configura un dominio, sus competidores y los primeros prompts en un flujo guiado.</p>
        </div>
        <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--ink-2)]">
          <Icon name="chevronLeft" size={14} />
          Volver
        </Link>
      </div>

    <Card className="overflow-hidden">
      <CardHeader className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Configura tu espacio de visibilidad</h2>
          <p className="sub mt-1">
            Indica tu dominio y mercado. Sugerimos competidores y prompts con Gemini; revísalos y edítalos antes de
            lanzar el primer escaneo.
          </p>
        </div>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <WizardSteps currentStep={step} />
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {errorMessage ? <p className="feedback error">{errorMessage}</p> : null}

        {/* Step 2 — competitors (editable) */}
        <section className={step === 1 ? "space-y-4" : "hidden"}>
          <div className="rounded-[14px] border border-[var(--accent-soft-2)] bg-[var(--accent-soft)] p-4">
            <h4 className="text-sm font-semibold text-[var(--accent-ink)]">Competidores sugeridos</h4>
            <p className="mt-1 text-sm text-[var(--ink-2)]">
              Sugeridos por Gemini para {domain || "tu dominio"}. Edítalos, elimínalos o añade los tuyos.
            </p>
          </div>

          <div className="space-y-2">
            {competitors.map((row, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <Input
                  aria-label={`Nombre competidor ${index + 1}`}
                  placeholder="Nombre"
                  value={row.name}
                  onChange={(event) => updateCompetitor(index, { name: event.target.value })}
                />
                <Input
                  aria-label={`Dominio competidor ${index + 1}`}
                  placeholder="dominio.com"
                  value={row.domain}
                  onChange={(event) => updateCompetitor(index, { domain: event.target.value })}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCompetitors((rows) => rows.filter((_, i) => i !== index))}
                >
                  Quitar
                </Button>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[var(--line)] bg-white p-3">
            <p className="sub">{validCompetitorCount} competidor{validCompetitorCount === 1 ? "" : "es"} listo{validCompetitorCount === 1 ? "" : "s"}.</p>
            <Button type="button" variant="outline" onClick={() => setCompetitors((rows) => [...rows, { name: "", domain: "" }])}>
              Añadir competidor
            </Button>
          </div>

          <div className="flex items-center justify-between border-t border-[var(--line-soft)] pt-4">
            <Button type="button" variant="outline" onClick={() => setStep(0)}>
              Atrás
            </Button>
            <Button type="button" onClick={() => setStep(2)} className="inline-flex items-center gap-2">
              Continuar a prompts
              <Icon name="arrRight" size={16} />
            </Button>
          </div>
        </section>

        {/* Step 3 — prompts (editable) + submit */}
        <section className={step === 2 ? "space-y-4" : "hidden"}>
          <div className="rounded-[14px] border border-[var(--accent-soft-2)] bg-[var(--accent-soft)] p-4">
            <h4 className="text-sm font-semibold text-[var(--accent-ink)]">Prompts sugeridos</h4>
            <p className="mt-1 text-sm text-[var(--ink-2)]">
              Preguntas que enviaremos a Gemini para medir tu visibilidad. Edítalas o añade las tuyas (máx. 10).
            </p>
          </div>

          <div className="space-y-2">
            {prompts.map((row, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <Textarea
                  aria-label={`Prompt ${index + 1}`}
                  rows={2}
                  placeholder="Ej. ¿Cuáles son las mejores herramientas para…?"
                  value={row}
                  onChange={(event) => updatePrompt(index, event.target.value)}
                />
                <Button type="button" variant="outline" onClick={() => setPrompts((rows) => rows.filter((_, i) => i !== index))}>
                  Quitar
                </Button>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[var(--line)] bg-white p-3">
            <p className="sub">{validPromptCount} prompt{validPromptCount === 1 ? "" : "s"} listo{validPromptCount === 1 ? "" : "s"}.</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPrompts((rows) => (rows.length >= 10 ? rows : [...rows, ""]))}
              disabled={prompts.length >= 10}
            >
              Añadir prompt
            </Button>
          </div>

          <form action={createAction} className="flex items-center justify-between border-t border-[var(--line-soft)] pt-4">
            <input type="hidden" name="domain" value={domain} />
            <input type="hidden" name="country" value={country} />
            <input type="hidden" name="language" value={language} />
            <input type="hidden" name="initial_competitors" value={competitorsText} />
            <input type="hidden" name="initial_prompts" value={promptsText} />
            <Button type="button" variant="outline" onClick={() => setStep(1)}>
              Atrás
            </Button>
            <Button type="submit" disabled={validPromptCount === 0} className="inline-flex items-center gap-2">
              Crear dominio y escanear
              <Icon name="arrRight" size={16} />
            </Button>
          </form>
        </section>
      </CardContent>
    </Card>
    </div>
  );
}
