"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Icon } from "@/components/ui/icon";
import { Stepper } from "@/components/stepper";
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

const steps = [
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

  const domainHasValue = domain.trim().length > 0;
  const domainIsValid = isValidDomain(domain);

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

  return (
    <Card className="overflow-hidden">
      <CardHeader className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Configura tu espacio de visibilidad</h2>
          <p className="sub mt-1">
            Indica tu dominio y mercado. Sugerimos competidores y prompts con Gemini; revísalos y edítalos antes de
            lanzar el primer escaneo.
          </p>
        </div>
        <Stepper currentStep={step} steps={steps} />
      </CardHeader>
      <CardContent className="space-y-5">
        {errorMessage ? <p className="feedback error">{errorMessage}</p> : null}

        {/* Step 1 — domain + country */}
        <section className={step === 0 ? "space-y-4" : "hidden"}>
          <div>
            <Label htmlFor="domain">Dominio</Label>
            <Input
              id="domain"
              name="domain"
              placeholder="ejemplo.com"
              value={domain}
              onChange={(event) => setDomain(event.target.value)}
              autoFocus
              aria-describedby="domain-help"
            />
            <p id="domain-help" className="sub mt-1">
              Escribe solo el dominio, sin https:// ni rutas. Ejemplo: lumira.ai
            </p>
            {domainHasValue && !domainIsValid ? (
              <p className="feedback error mt-2">Introduce un dominio válido, por ejemplo ejemplo.com.</p>
            ) : null}
          </div>

          <div>
            <Label htmlFor="country">País / mercado</Label>
            <select
              id="country"
              value={country}
              onChange={(event) => setCountry(event.target.value)}
              className="mt-1 w-full rounded-[10px] border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--ink)]"
            >
              {COUNTRIES.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>

          {suggestError ? <p className="feedback error">{suggestError}</p> : null}

          <div className="flex items-center justify-end border-t border-[var(--line-soft)] pt-4">
            <Button type="button" onClick={generateSuggestions} disabled={!domainIsValid || isPending} className="inline-flex items-center gap-2">
              {isPending ? "Generando sugerencias…" : "Generar sugerencias"}
              {!isPending ? <Icon name="arrRight" size={16} /> : null}
            </Button>
          </div>
        </section>

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
  );
}
