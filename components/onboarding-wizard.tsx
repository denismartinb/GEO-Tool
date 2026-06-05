"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Stepper } from "@/components/stepper";

const steps = [
  {
    label: "Dominio",
    description: "Marca, mercado e idioma"
  },
  {
    label: "Competidores",
    description: "Rivales a vigilar"
  },
  {
    label: "Prompts",
    description: "Preguntas iniciales"
  }
];

type CompetitorRow = { name: string; domain: string };
const emptyCompetitorRows: CompetitorRow[] = [
  { name: "", domain: "" },
  { name: "", domain: "" },
  { name: "", domain: "" },
];
const emptyPromptRows = ["", "", "", "", ""];

function isValidDomain(value: string) {
  const domain = value.trim().toLowerCase();

  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(domain);
}

function joinRows(rows: string[]) {
  return rows
    .map((row) => row.trim())
    .filter(Boolean)
    .join("\n");
}

export function OnboardingWizard({ errorMessage }: { errorMessage: string | null }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [brand, setBrand] = useState("");
  const [businessDescription, setBusinessDescription] = useState("");
  const [country, setCountry] = useState("ES");
  const [language, setLanguage] = useState("es");
  const [competitorRows, setCompetitorRows] = useState(emptyCompetitorRows);
  const [promptRows, setPromptRows] = useState(emptyPromptRows);

  const domainHasValue = domain.trim().length > 0;
  const domainIsValid = isValidDomain(domain);
  const canContinueDomain =
    name.trim().length > 0 && domainIsValid && brand.trim().length > 0 && country.trim().length > 0 && language.trim().length > 0;
  const competitorsText = useMemo(
    () =>
      competitorRows
        .filter((row) => row.name.trim() && row.domain.trim())
        .map((row) => `${row.name.trim()} | ${row.domain.trim()}`)
        .slice(0, 5)
        .join("\n"),
    [competitorRows]
  );
  const promptsText = useMemo(() => joinRows(promptRows), [promptRows]);
  const competitorCount = competitorRows.filter((row) => row.name.trim() && row.domain.trim()).length;
  const promptCount = promptRows.filter((row) => row.trim()).length;

  function updateCompetitorRow(index: number, field: "name" | "domain", value: string) {
    setCompetitorRows((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row));
  }

  function updatePromptRow(index: number, value: string) {
    setPromptRows((rows) => rows.map((row, rowIndex) => (rowIndex === index ? value : row)));
  }

  function removeCompetitorRow(index: number) {
    setCompetitorRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index));
  }

  function removePromptRow(index: number) {
    setPromptRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index));
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="space-y-4">
        <div>
          <h2 className="font-medium">Configura tu primer espacio de visibilidad</h2>
          <p className="sub mt-1">
            Te guiamos en tres pasos. No se lanzará ningún escaneo ni llamada a Gemini hasta que lo ejecutes manualmente.
          </p>
        </div>
        <Stepper currentStep={currentStep} steps={steps} />
      </CardHeader>
      <CardContent className="space-y-5">
        {errorMessage ? <p className="feedback error">{errorMessage}</p> : null}

        <section className={currentStep === 0 ? "space-y-4" : "hidden"} aria-labelledby="step-domain-title">
          <div className="rounded-[16px] border border-[#e8eaef] bg-[#fbfbfd] p-4">
            <p className="kicker">Paso 1</p>
            <h3 id="step-domain-title" className="mt-1 text-lg font-semibold">
              Dominio y contexto del proyecto
            </h3>
            <p className="sub mt-1">
              Define la marca, el dominio y el mercado que quieres medir. Esta base se usará para prompts, escaneos y reporting.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="name">Nombre del proyecto</Label>
              <Input id="name" name="name" value={name} onChange={(event) => setName(event.target.value)} required />
            </div>
            <div>
              <Label htmlFor="brand">Marca</Label>
              <Input id="brand" name="brand" value={brand} onChange={(event) => setBrand(event.target.value)} required />
            </div>
          </div>

          <div>
            <Label htmlFor="domain">Dominio</Label>
            <Input
              id="domain"
              name="domain"
              placeholder="example.com"
              value={domain}
              onChange={(event) => setDomain(event.target.value)}
              required
              aria-describedby="domain-help"
            />
            <p id="domain-help" className="sub mt-1">
              Escribe solo el dominio, sin https:// ni rutas. Ejemplo: geostudio.ai
            </p>
            {domainHasValue && !domainIsValid ? <p className="feedback error mt-2">Introduce un dominio válido, por ejemplo example.com.</p> : null}
          </div>

          <div>
            <Label htmlFor="business_description">Describe brevemente tu negocio o categoría</Label>
            <Textarea
              id="business_description"
              name="business_description"
              placeholder="Ej. Plataforma SaaS para medir visibilidad de marca en motores de IA"
              rows={3}
              value={businessDescription}
              onChange={(event) => setBusinessDescription(event.target.value)}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="country">País</Label>
              <select
                id="country"
                name="country"
                value={country}
                onChange={(event) => setCountry(event.target.value)}
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
                onChange={(event) => setLanguage(event.target.value)}
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

        <section className={currentStep === 1 ? "space-y-4" : "hidden"} aria-labelledby="step-competitors-title">
          <div className="rounded-[16px] border border-[#e8eaef] bg-[#fbfbfd] p-4">
            <p className="kicker">Paso 2</p>
            <h3 id="step-competitors-title" className="mt-1 text-lg font-semibold">
              Competidores iniciales
            </h3>
            <p className="sub mt-1">
              Añade rivales que quieras vigilar desde el primer escaneo. Introduce el nombre y el dominio por separado.
            </p>
          </div>

          <div className="space-y-2">
            {competitorRows.map((row, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <Input
                  aria-label={`Nombre del competidor ${index + 1}`}
                  placeholder="Nombre"
                  value={row.name}
                  onChange={(event) => updateCompetitorRow(index, "name", event.target.value)}
                />
                <Input
                  aria-label={`Dominio del competidor ${index + 1}`}
                  placeholder="dominio.com"
                  value={row.domain}
                  onChange={(event) => updateCompetitorRow(index, "domain", event.target.value)}
                />
                <Button type="button" variant="outline" onClick={() => removeCompetitorRow(index)} disabled={competitorRows.length === 1}>
                  Quitar
                </Button>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[#e8eaef] bg-white p-3">
            <p className="sub">
              {competitorCount} competidor{competitorCount === 1 ? "" : "es"} preparado{competitorCount === 1 ? "" : "s"} para guardar.
            </p>
            <Button type="button" variant="outline" onClick={() => setCompetitorRows((rows) => [...rows, { name: "", domain: "" }])}>
              Añadir competidor
            </Button>
          </div>
        </section>

        <section className={currentStep === 2 ? "space-y-4" : "hidden"} aria-labelledby="step-prompts-title">
          <div className="rounded-[16px] border border-[#e8eaef] bg-[#fbfbfd] p-4">
            <p className="kicker">Paso 3</p>
            <h3 id="step-prompts-title" className="mt-1 text-lg font-semibold">
              Prompts iniciales
            </h3>
            <p className="sub mt-1">
              Prepara preguntas que una persona real haría a Gemini sobre tu categoría. Podrás editarlas antes de lanzar el primer escaneo.
            </p>
          </div>

          <div className="rounded-[14px] border border-[var(--accent-soft-2)] bg-[var(--accent-soft)] p-4">
            <h4 className="text-sm font-semibold text-[var(--accent-ink)]">¿Qué es un prompt?</h4>
            <p className="mt-1 text-sm text-[var(--ink-2)]">
              Es una pregunta o instrucción que enviaremos al motor de IA para observar si menciona tu marca, competidores y fuentes citadas.
            </p>
          </div>

          <div className="space-y-2">
            {promptRows.map((row, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <Textarea
                  aria-label={`Prompt ${index + 1}`}
                  placeholder="Ej. ¿Cuáles son las mejores herramientas para medir visibilidad en IA?"
                  rows={2}
                  value={row}
                  onChange={(event) => updatePromptRow(index, event.target.value)}
                />
                <Button type="button" variant="outline" onClick={() => removePromptRow(index)} disabled={promptRows.length === 1}>
                  Quitar
                </Button>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[#e8eaef] bg-white p-3">
            <p className="sub">
              {promptCount} prompt{promptCount === 1 ? "" : "s"} creado{promptCount === 1 ? "" : "s"}. Máximo recomendado para beta: 10.
            </p>
            <Button type="button" variant="outline" onClick={() => setPromptRows((rows) => [...rows, ""])}>
              Añadir prompt
            </Button>
          </div>
        </section>

        <textarea id="initial_competitors" name="initial_competitors" value={competitorsText} readOnly className="hidden" />
        <textarea id="initial_prompts" name="initial_prompts" value={promptsText} readOnly className="hidden" />

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eef0f4] pt-4">
          <p className="sub">Mantén el setup simple: dominio, rivales y preguntas iniciales. El escaneo se lanza después.</p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => setCurrentStep((step) => Math.max(step - 1, 0))} disabled={currentStep === 0}>
              Atrás
            </Button>
            {currentStep < 2 ? (
              <Button type="button" onClick={() => setCurrentStep((step) => Math.min(step + 1, 2))} disabled={currentStep === 0 && !canContinueDomain}>
                Continuar
              </Button>
            ) : (
              <Button type="submit">Crear proyecto</Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
