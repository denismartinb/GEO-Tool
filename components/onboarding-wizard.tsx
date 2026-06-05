"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/ui/icon";
import { Label } from "@/components/ui/label";
import { Stepper } from "@/components/stepper";
import {
  suggestCompetitors,
  suggestPrompts,
  type CompetitorSuggestion,
} from "@/app/dashboard/projects/new/suggestion-actions";

const steps = [
  { label: "Dominio", description: "Marca, mercado e idioma" },
  { label: "Competidores", description: "Rivales a vigilar" },
  { label: "Prompts", description: "Preguntas iniciales" },
];

type CompetitorRow = { name: string; domain: string };
type PromptRow = { text: string; active: boolean };

const EMPTY_COMPETITOR_ROWS: CompetitorRow[] = [
  { name: "", domain: "" },
  { name: "", domain: "" },
  { name: "", domain: "" },
];

const CHIP_COLORS = [
  "#6366f1", "#0e9488", "#d9772b", "#9333a8", "#3b6fd6", "#0891b2",
];

const COMPETITOR_LOADING_STEPS = [
  "Analizando dominio y categoría del negocio…",
  "Identificando competidores relevantes…",
  "Preparando sugerencias…",
];

const PROMPT_LOADING_STEPS = [
  "Analizando la categoría del negocio…",
  "Generando preguntas para motores de IA…",
  "Preparando prompts iniciales…",
];

function isValidDomain(value: string) {
  const domain = value.trim().toLowerCase();
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(
    domain,
  );
}

function classifyIntent(text: string): "Comercial" | "Informacional" | "Transaccional" {
  const t = text.toLowerCase();
  if (/cuánto|cuanto|precio|coste|tarifa|pagar|comprar|costar/.test(t))
    return "Transaccional";
  if (
    /qué es|que es|cómo|como |por qué|por que|cuál es|cual es|diferencia|explica|defin|significa|guía|guia/.test(
      t,
    )
  )
    return "Informacional";
  return "Comercial";
}

function intentStyle(intent: string): React.CSSProperties {
  if (intent === "Transaccional")
    return { background: "var(--warn-soft)", color: "var(--warn-ink)" };
  if (intent === "Informacional")
    return { background: "var(--surface-sunk)", color: "var(--ink-2)" };
  return { background: "var(--accent-soft)", color: "var(--accent-ink)" };
}

function SuggestionLoader({
  loadingSteps,
  label,
}: {
  loadingSteps: string[];
  label: string;
}) {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setActiveStep((s) => (s < loadingSteps.length - 1 ? s + 1 : s));
    }, 1400);
    return () => clearInterval(id);
  }, [loadingSteps.length]);

  const pct = Math.min(90, Math.round(((activeStep + 1) / loadingSteps.length) * 100));

  return (
    <div className="flex flex-col items-center gap-5 py-8 text-center">
      <div className="flex flex-col items-center gap-2">
        <div
          className="h-9 w-9 animate-spin rounded-full"
          style={{ border: "3px solid var(--line)", borderTopColor: "var(--accent)" }}
        />
        <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
          {label}
        </p>
        <p className="text-xs" style={{ color: "var(--ink-3)" }}>
          Consultando Gemini, un momento…
        </p>
      </div>

      <div className="w-full max-w-xs space-y-2.5 text-left">
        {loadingSteps.map((step, i) => (
          <div
            key={i}
            className="flex items-center gap-2.5 text-sm"
            style={{
              color: i === activeStep ? "var(--ink)" : "var(--ink-4)",
              opacity: i > activeStep ? 0.4 : 1,
              fontWeight: i === activeStep ? 500 : 400,
            }}
          >
            <span className="flex h-4 w-4 shrink-0 items-center justify-center text-xs">
              {i < activeStep ? (
                "✓"
              ) : i === activeStep ? (
                <span
                  className="h-1.5 w-1.5 animate-pulse rounded-full"
                  style={{ backgroundColor: "var(--accent)" }}
                />
              ) : (
                i + 1
              )}
            </span>
            {step}
          </div>
        ))}
      </div>

      <div className="w-full max-w-xs">
        <div className="h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: "var(--line)" }}>
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${pct}%`, backgroundColor: "var(--accent)" }}
          />
        </div>
        <p className="mt-1 text-xs" style={{ color: "var(--ink-4)" }}>
          {pct}%
        </p>
      </div>
    </div>
  );
}

export function OnboardingWizard({ errorMessage }: { errorMessage: string | null }) {
  const [currentStep, setCurrentStep] = useState(0);

  /* Step 1 state */
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [brand, setBrand] = useState("");
  const [businessDescription, setBusinessDescription] = useState("");
  const [country, setCountry] = useState("ES");
  const [language, setLanguage] = useState("es");

  /* Step 2 state */
  const [competitorRows, setCompetitorRows] = useState<CompetitorRow[]>(EMPTY_COMPETITOR_ROWS);
  const [isSuggestingCompetitors, setIsSuggestingCompetitors] = useState(false);

  /* Step 3 state */
  const [promptRows, setPromptRows] = useState<PromptRow[]>([]);
  const [promptDraft, setPromptDraft] = useState("");
  const [isSuggestingPrompts, setIsSuggestingPrompts] = useState(false);

  /* Derived */
  const domainHasValue = domain.trim().length > 0;
  const domainIsValid = isValidDomain(domain);
  const canContinueDomain =
    name.trim().length > 0 &&
    domainIsValid &&
    brand.trim().length > 0 &&
    country.trim().length > 0 &&
    language.trim().length > 0;

  const competitorsText = useMemo(
    () =>
      competitorRows
        .filter((r) => r.name.trim() && r.domain.trim())
        .map((r) => `${r.name.trim()} | ${r.domain.trim()}`)
        .slice(0, 5)
        .join("\n"),
    [competitorRows],
  );

  const promptsText = useMemo(
    () =>
      promptRows
        .filter((r) => r.active && r.text.trim())
        .map((r) => r.text.trim())
        .join("\n"),
    [promptRows],
  );

  const competitorCount = competitorRows.filter((r) => r.name.trim() && r.domain.trim()).length;
  const activePromptCount = promptRows.filter((r) => r.active && r.text.trim()).length;
  const totalPromptCount = promptRows.filter((r) => r.text.trim()).length;
  const allPromptsActive =
    totalPromptCount > 0 &&
    promptRows.filter((r) => r.text.trim()).every((r) => r.active);
  const isLoading = isSuggestingCompetitors || isSuggestingPrompts;

  /* Competitor row helpers */
  function updateCompetitorRow(index: number, field: "name" | "domain", value: string) {
    setCompetitorRows((rows) =>
      rows.map((r, i) => (i === index ? { ...r, [field]: value } : r)),
    );
  }
  function removeCompetitorRow(index: number) {
    setCompetitorRows((rows) => rows.filter((_, i) => i !== index));
  }

  /* Prompt row helpers */
  function togglePromptRow(index: number) {
    setPromptRows((rows) =>
      rows.map((r, i) => (i === index ? { ...r, active: !r.active } : r)),
    );
  }
  function removePromptRow(index: number) {
    setPromptRows((rows) => rows.filter((_, i) => i !== index));
  }
  function toggleAllPrompts() {
    setPromptRows((rows) =>
      rows.map((r) => ({ ...r, active: !allPromptsActive })),
    );
  }
  function addDraftPrompt() {
    const text = promptDraft.trim();
    if (!text) return;
    setPromptRows((rows) => [{ text, active: true }, ...rows]);
    setPromptDraft("");
  }

  /* Navigation with Gemini suggestions */
  async function handleContinue() {
    if (currentStep === 0) {
      setCurrentStep(1);
      setIsSuggestingCompetitors(true);
      try {
        const suggestions: CompetitorSuggestion[] = await suggestCompetitors({
          domain,
          brand,
          description: businessDescription,
          country,
          language,
        });
        if (suggestions.length > 0) {
          const rows: CompetitorRow[] = suggestions.map((s) => ({
            name: s.name,
            domain: s.domain,
          }));
          while (rows.length < 3) rows.push({ name: "", domain: "" });
          setCompetitorRows(rows);
        }
      } catch {
        // leave empty rows — user fills manually
      } finally {
        setIsSuggestingCompetitors(false);
      }
    } else if (currentStep === 1) {
      setCurrentStep(2);
      setIsSuggestingPrompts(true);
      try {
        const suggestions: string[] = await suggestPrompts({
          domain,
          brand,
          description: businessDescription,
          country,
          language,
        });
        if (suggestions.length > 0) {
          setPromptRows(suggestions.map((text) => ({ text, active: true })));
        }
      } catch {
        // leave empty — user fills manually
      } finally {
        setIsSuggestingPrompts(false);
      }
    }
  }

  /* Ranking preview for step 2 */
  const rankingRows = useMemo(
    () => [
      { name: brand || "Tu marca", isYou: true, colorIdx: 0 },
      ...competitorRows
        .filter((r) => r.name.trim())
        .map((r, i) => ({ name: r.name, isYou: false, colorIdx: i + 1 })),
    ],
    [brand, competitorRows],
  );

  return (
    <Card className="overflow-hidden">
      <CardHeader className="space-y-4">
        <div>
          <h2 className="font-medium">Configura tu primer espacio de visibilidad</h2>
          <p className="sub mt-1">
            Te guiamos en tres pasos. No se lanzará ningún escaneo hasta que lo ejecutes
            manualmente.
          </p>
        </div>
        <Stepper currentStep={currentStep} steps={steps} />
      </CardHeader>
      <CardContent className="space-y-5">
        {errorMessage ? <p className="feedback error">{errorMessage}</p> : null}

        {/* ── Step 0: Dominio ───────────────────────────────────────────── */}
        <section
          className={currentStep === 0 ? "space-y-4" : "hidden"}
          aria-labelledby="step-domain-title"
        >
          <div className="rounded-[16px] border border-[#e8eaef] bg-[#fbfbfd] p-4">
            <p className="kicker">Paso 1</p>
            <h3 id="step-domain-title" className="mt-1 text-lg font-semibold">
              Dominio y contexto del proyecto
            </h3>
            <p className="sub mt-1">
              Define la marca, el dominio y el mercado que quieres medir. Esta base se usará para
              prompts, escaneos y reporting.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="name">Nombre del proyecto</Label>
              <Input
                id="name"
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="brand">Marca</Label>
              <Input
                id="brand"
                name="brand"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="domain">Dominio</Label>
            <Input
              id="domain"
              name="domain"
              placeholder="example.com"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              required
              aria-describedby="domain-help"
            />
            <p id="domain-help" className="sub mt-1">
              Sin https:// ni rutas. Ejemplo: geostudio.ai
            </p>
            {domainHasValue && !domainIsValid ? (
              <p className="feedback error mt-2">
                Introduce un dominio válido, por ejemplo example.com.
              </p>
            ) : null}
          </div>

          <div>
            <Label htmlFor="business_description">Describe brevemente tu negocio o categoría</Label>
            <textarea
              id="business_description"
              name="business_description"
              placeholder="Ej. Plataforma SaaS para medir visibilidad de marca en motores de IA"
              rows={3}
              value={businessDescription}
              onChange={(e) => setBusinessDescription(e.target.value)}
              className="flex min-h-[72px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="country">País</Label>
              <select
                id="country"
                name="country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                required
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="ES">España</option>
                <option value="MX">México</option>
                <option value="AR">Argentina</option>
                <option value="CO">Colombia</option>
                <option value="CL">Chile</option>
                <option value="PE">Perú</option>
                <option value="US">Estados Unidos</option>
                <option value="UK">Reino Unido</option>
                <option value="DE">Alemania</option>
                <option value="FR">Francia</option>
              </select>
            </div>
            <div>
              <Label htmlFor="language">Idioma</Label>
              <select
                id="language"
                name="language"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                required
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="es">Español</option>
                <option value="en">Inglés</option>
                <option value="de">Alemán</option>
                <option value="fr">Francés</option>
                <option value="pt">Portugués</option>
              </select>
            </div>
          </div>
        </section>

        {/* ── Step 1: Competidores ─────────────────────────────────────── */}
        <section
          className={currentStep === 1 ? "space-y-4" : "hidden"}
          aria-labelledby="step-competitors-title"
        >
          {isSuggestingCompetitors ? (
            <SuggestionLoader
              loadingSteps={COMPETITOR_LOADING_STEPS}
              label="Buscando competidores…"
            />
          ) : (
            <>
              <div className="rounded-[16px] border border-[#e8eaef] bg-[#fbfbfd] p-4">
                <p className="kicker">Paso 2</p>
                <h3 id="step-competitors-title" className="mt-1 text-lg font-semibold">
                  Tus competidores
                </h3>
                <p className="sub mt-1">
                  Analizamos{" "}
                  <code
                    className="rounded px-1 py-0.5 text-xs font-semibold"
                    style={{ background: "var(--surface-sunk)", color: "var(--ink-2)", fontFamily: "ui-monospace,monospace" }}
                  >
                    {domain}
                  </code>{" "}
                  e identificamos tus principales competidores. Edítalos si algo no encaja.
                </p>
              </div>

              {/* 2-column: list + ranking preview */}
              <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
                {/* LEFT: competitor list */}
                <div>
                  {/* Column headers */}
                  <div className="mb-2 grid grid-cols-[32px_1fr_1fr_36px] gap-2 px-1">
                    <span />
                    <span
                      className="text-xs font-semibold uppercase tracking-[0.08em]"
                      style={{ color: "var(--ink-4)" }}
                    >
                      Marca
                    </span>
                    <span
                      className="text-xs font-semibold uppercase tracking-[0.08em]"
                      style={{ color: "var(--ink-4)" }}
                    >
                      Dominio
                    </span>
                    <span />
                  </div>

                  <div className="space-y-2">
                    {competitorRows.map((row, index) => (
                      <div
                        key={index}
                        className="grid grid-cols-[32px_1fr_1fr_36px] items-center gap-2"
                      >
                        {/* Color chip */}
                        <div
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-[7px] text-sm font-bold text-white"
                          style={{
                            backgroundColor: row.name.trim()
                              ? CHIP_COLORS[index % CHIP_COLORS.length]
                              : "var(--line)",
                            color: row.name.trim() ? "#fff" : "var(--ink-4)",
                          }}
                        >
                          {row.name.trim() ? row.name.trim()[0].toUpperCase() : "?"}
                        </div>
                        <Input
                          aria-label={`Nombre del competidor ${index + 1}`}
                          placeholder="Nombre"
                          value={row.name}
                          onChange={(e) => updateCompetitorRow(index, "name", e.target.value)}
                        />
                        <Input
                          aria-label={`Dominio del competidor ${index + 1}`}
                          placeholder="dominio.com"
                          value={row.domain}
                          onChange={(e) => updateCompetitorRow(index, "domain", e.target.value)}
                        />
                        <button
                          type="button"
                          onClick={() => removeCompetitorRow(index)}
                          disabled={competitorRows.length === 1}
                          className="grid h-8 w-8 place-items-center rounded-[7px] text-lg leading-none transition-colors disabled:opacity-30"
                          style={{ color: "var(--ink-4)" }}
                          aria-label={`Quitar competidor ${index + 1}`}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-4">
                    <p className="text-xs" style={{ color: "var(--ink-4)" }}>
                      Monitorizaremos cada competidor en los mismos prompts que tu marca.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        setCompetitorRows((rows) => [...rows, { name: "", domain: "" }])
                      }
                    >
                      Añadir
                    </Button>
                  </div>
                </div>

                {/* RIGHT: ranking preview */}
                <div className="hidden xl:block">
                  <div
                    className="sticky top-4 rounded-[14px] border bg-white"
                    style={{ borderColor: "var(--line)" }}
                  >
                    <div
                      className="flex items-center justify-between border-b px-4 py-3"
                      style={{ borderColor: "var(--line-soft)" }}
                    >
                      <p
                        className="text-sm font-bold"
                        style={{ color: "var(--ink)" }}
                      >
                        Ranking de marcas
                      </p>
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-semibold"
                        style={{ background: "var(--surface-sunk)", color: "var(--ink-3)" }}
                      >
                        Vista previa
                      </span>
                    </div>

                    {/* Column headers */}
                    <div
                      className="grid grid-cols-[20px_1fr_60px] gap-2 px-4 py-2 text-xs font-semibold uppercase tracking-[0.07em]"
                      style={{ color: "var(--ink-4)" }}
                    >
                      <span>#</span>
                      <span>Marca</span>
                      <span>Menciones</span>
                    </div>

                    {/* Rows */}
                    <div style={{ borderTop: "1px solid var(--line-soft)" }}>
                      {rankingRows.map((r, i) => (
                        <div
                          key={i}
                          className="grid grid-cols-[20px_1fr_60px] items-center gap-2 px-4 py-2"
                          style={{
                            borderBottom: "1px solid var(--line-soft)",
                            background: r.isYou ? "var(--accent-soft)" : "transparent",
                          }}
                        >
                          <span
                            className="text-xs font-bold"
                            style={{ color: r.isYou ? "var(--accent-ink)" : "var(--ink-4)" }}
                          >
                            {i + 1}
                          </span>
                          <div className="flex min-w-0 items-center gap-2">
                            <div
                              className="grid h-6 w-6 shrink-0 place-items-center rounded-[5px] text-xs font-bold text-white"
                              style={{ backgroundColor: CHIP_COLORS[r.colorIdx % CHIP_COLORS.length] }}
                            >
                              {r.name[0]?.toUpperCase() ?? "?"}
                            </div>
                            <span
                              className="truncate text-xs font-semibold"
                              style={{ color: r.isYou ? "var(--accent-ink)" : "var(--ink-2)" }}
                            >
                              {r.name}
                              {r.isYou ? (
                                <span
                                  className="ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white"
                                  style={{ backgroundColor: "var(--accent)" }}
                                >
                                  Tú
                                </span>
                              ) : null}
                            </span>
                          </div>
                          <div
                            className="h-1.5 rounded-full"
                            style={{ background: r.isYou ? "var(--accent-soft-2)" : "var(--line)" }}
                          />
                        </div>
                      ))}
                    </div>

                    <p
                      className="px-4 py-3 text-xs"
                      style={{ color: "var(--ink-4)", borderTop: "1px solid var(--line-soft)" }}
                    >
                      Las métricas se calcularán tras el primer escaneo.
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>

        {/* ── Step 2: Prompts ───────────────────────────────────────────── */}
        <section
          className={currentStep === 2 ? "space-y-4" : "hidden"}
          aria-labelledby="step-prompts-title"
        >
          {isSuggestingPrompts ? (
            <SuggestionLoader
              loadingSteps={PROMPT_LOADING_STEPS}
              label="Generando prompts iniciales…"
            />
          ) : (
            <>
              <div className="rounded-[16px] border border-[#e8eaef] bg-[#fbfbfd] p-4">
                <p className="kicker">Paso 3</p>
                <h3 id="step-prompts-title" className="mt-1 text-lg font-semibold">
                  Revisa y selecciona tus prompts
                </h3>
                <p className="sub mt-1">
                  Estos son los prompts que hemos generado para{" "}
                  <code
                    className="rounded px-1 py-0.5 text-xs font-semibold"
                    style={{ background: "var(--surface-sunk)", color: "var(--ink-2)", fontFamily: "ui-monospace,monospace" }}
                  >
                    {domain}
                  </code>
                  . Selecciona los que quieras monitorizar — recomendamos al menos{" "}
                  <strong style={{ color: "var(--ink-2)" }}>5</strong> para obtener mejores datos.
                </p>
              </div>

              {/* 2-column: list + summary */}
              <div className="grid gap-6 xl:grid-cols-[1fr_260px]">
                {/* LEFT: prompt list */}
                <div>
                  {/* Add own prompt input */}
                  <div
                    className="mb-3 flex items-center gap-2 rounded-[10px] border bg-white px-3 py-2"
                    style={{ borderColor: "var(--line)" }}
                  >
                    <span style={{ color: "var(--ink-4)" }}>+</span>
                    <input
                      className="flex-1 bg-transparent text-sm outline-none"
                      placeholder="Añade tu propio prompt…"
                      style={{ color: "var(--ink)" }}
                      value={promptDraft}
                      onChange={(e) => setPromptDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addDraftPrompt();
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={addDraftPrompt}
                      disabled={!promptDraft.trim()}
                    >
                      Añadir
                    </Button>
                  </div>

                  {/* Select all + count */}
                  {totalPromptCount > 0 ? (
                    <div className="mb-2 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={toggleAllPrompts}
                        className="flex items-center gap-2 text-sm"
                        style={{ color: "var(--ink-2)" }}
                      >
                        <span
                          className="flex h-4 w-4 items-center justify-center rounded border text-white text-[10px]"
                          style={{
                            background: allPromptsActive ? "var(--accent)" : "transparent",
                            borderColor: allPromptsActive ? "var(--accent)" : "var(--line-strong)",
                          }}
                        >
                          {allPromptsActive ? "✓" : ""}
                        </span>
                        Seleccionar todo
                      </button>
                      <p className="text-xs" style={{ color: "var(--ink-3)" }}>
                        <b style={{ color: "var(--ink-2)" }}>{activePromptCount}</b>/
                        {totalPromptCount} seleccionados
                      </p>
                    </div>
                  ) : null}

                  {/* Prompt rows */}
                  {promptRows.length === 0 ? (
                    <div
                      className="rounded-[10px] border border-dashed p-6 text-center text-sm"
                      style={{ borderColor: "var(--line)", color: "var(--ink-4)" }}
                    >
                      Escribe un prompt arriba o espera a que Gemini los genere.
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {promptRows.map((row, index) => {
                        const intent = row.text.trim() ? classifyIntent(row.text) : null;
                        return (
                          <div
                            key={index}
                            className="flex cursor-pointer items-start gap-3 rounded-[10px] border px-3 py-2.5 transition-colors"
                            style={{
                              borderColor: row.active ? "var(--accent-soft-2)" : "var(--line)",
                              backgroundColor: row.active ? "var(--accent-soft)" : "var(--surface-2)",
                            }}
                            onClick={() => row.text.trim() && togglePromptRow(index)}
                          >
                            {/* Checkbox */}
                            <span
                              className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-white text-[10px]"
                              style={{
                                background: row.active ? "var(--accent)" : "transparent",
                                borderColor: row.active ? "var(--accent)" : "var(--line-strong)",
                              }}
                            >
                              {row.active ? "✓" : ""}
                            </span>
                            {/* Text */}
                            <span
                              className="flex-1 text-sm leading-5"
                              style={{ color: row.active ? "var(--ink)" : "var(--ink-3)" }}
                            >
                              {row.text || (
                                <em style={{ color: "var(--ink-4)" }}>Prompt vacío</em>
                              )}
                            </span>
                            {/* Intent badge */}
                            {intent ? (
                              <span
                                className="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold"
                                style={intentStyle(intent)}
                              >
                                {intent}
                              </span>
                            ) : null}
                            {/* Delete */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                removePromptRow(index);
                              }}
                              disabled={promptRows.length === 1}
                              className="shrink-0 text-lg leading-none disabled:opacity-30"
                              style={{ color: "var(--ink-4)" }}
                              aria-label={`Quitar prompt ${index + 1}`}
                            >
                              ×
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* RIGHT: summary card */}
                <div className="hidden xl:block">
                  <div
                    className="sticky top-4 rounded-[14px] border bg-white"
                    style={{ borderColor: "var(--line)" }}
                  >
                    <div
                      className="border-b px-4 py-3"
                      style={{ borderColor: "var(--line-soft)" }}
                    >
                      <p className="text-sm font-bold" style={{ color: "var(--ink)" }}>
                        Resumen del set
                      </p>
                    </div>
                    <div className="space-y-4 p-4">
                      {/* Count */}
                      <div className="flex items-baseline gap-2">
                        <span
                          className="text-4xl font-bold tracking-tight"
                          style={{ color: "var(--accent)" }}
                        >
                          {activePromptCount}
                        </span>
                        <span className="text-sm" style={{ color: "var(--ink-3)" }}>
                          prompts seleccionados
                        </span>
                      </div>

                      {/* Progress bar */}
                      {(() => {
                        const target = 5;
                        const pct = Math.min(
                          100,
                          Math.round((activePromptCount / target) * 100),
                        );
                        const ok = activePromptCount >= target;
                        return (
                          <div>
                            <div
                              className="h-1.5 overflow-hidden rounded-full"
                              style={{ background: "var(--line)" }}
                            >
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                  width: `${pct}%`,
                                  backgroundColor: ok ? "var(--pos)" : "var(--accent)",
                                }}
                              />
                            </div>
                            <p
                              className="mt-1.5 text-xs"
                              style={{ color: ok ? "var(--pos-ink)" : "var(--ink-3)" }}
                            >
                              {ok
                                ? "✓ Listo — buen volumen de datos"
                                : `Añade ${target - activePromptCount} más para el mínimo recomendado (${target})`}
                            </p>
                          </div>
                        );
                      })()}

                      {/* Info rows */}
                      <div
                        className="space-y-2.5 border-t pt-3 text-xs"
                        style={{ borderColor: "var(--line-soft)", color: "var(--ink-2)" }}
                      >
                        <div className="flex items-center gap-2">
                          <Icon name="play" size={13} />
                          <span>Se consultarán en Gemini</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Icon name="competitors" size={13} />
                          <span>
                            Comparados con tus <b>competidores</b>
                          </span>
                        </div>
                      </div>

                      {/* What is a prompt */}
                      <div
                        className="rounded-[10px] border p-3"
                        style={{
                          borderColor: "var(--accent-soft-2)",
                          background: "var(--accent-soft)",
                        }}
                      >
                        <p
                          className="text-xs font-semibold"
                          style={{ color: "var(--accent-ink)" }}
                        >
                          ¿Qué es un prompt?
                        </p>
                        <p className="mt-1 text-xs" style={{ color: "var(--ink-2)" }}>
                          Una pregunta que tus clientes podrían hacer a una IA. Monitorizamos si tu
                          marca aparece en la respuesta.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>

        {/* Hidden serialized fields for the form action */}
        <textarea
          id="initial_competitors"
          name="initial_competitors"
          value={competitorsText}
          readOnly
          className="hidden"
        />
        <textarea
          id="initial_prompts"
          name="initial_prompts"
          value={promptsText}
          readOnly
          className="hidden"
        />

        {/* Footer navigation */}
        <div
          className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"
          style={{ borderColor: "var(--line-soft)" }}
        >
          <p className="sub">
            {currentStep === 2
              ? `${activePromptCount} prompt${activePromptCount === 1 ? "" : "s"} seleccionado${activePromptCount === 1 ? "" : "s"} · ${competitorCount} competidor${competitorCount === 1 ? "" : "es"} configurado${competitorCount === 1 ? "" : "s"}.`
              : "Mantén el setup simple: dominio, rivales y preguntas iniciales. El escaneo se lanza después."}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCurrentStep((s) => Math.max(s - 1, 0))}
              disabled={currentStep === 0 || isLoading}
            >
              Atrás
            </Button>
            {currentStep < 2 ? (
              <Button
                type="button"
                onClick={handleContinue}
                disabled={(currentStep === 0 && !canContinueDomain) || isLoading}
              >
                {isLoading ? "Cargando…" : "Continuar"}
              </Button>
            ) : (
              <Button type="submit" disabled={isLoading}>
                Empezar a monitorizar
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
