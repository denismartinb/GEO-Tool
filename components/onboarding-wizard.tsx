"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Icon } from "@/components/ui/icon";

const COUNTRIES: Array<{ code: string; name: string; language: string }> = [
  { code: "ES", name: "España", language: "es" },
  { code: "MX", name: "México", language: "es" },
  { code: "AR", name: "Argentina", language: "es" },
  { code: "CO", name: "Colombia", language: "es" },
  { code: "US", name: "Estados Unidos", language: "en" },
  { code: "UK", name: "Reino Unido", language: "en" },
  { code: "DE", name: "Alemania", language: "de" },
  { code: "FR", name: "Francia", language: "fr" },
  { code: "IT", name: "Italia", language: "it" },
  { code: "PT", name: "Portugal", language: "pt" },
  { code: "BR", name: "Brasil", language: "pt" }
];

function isValidDomain(value: string) {
  const domain = value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");

  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(domain);
}

export function OnboardingWizard({ errorMessage }: { errorMessage: string | null }) {
  const [domain, setDomain] = useState("");
  const [country, setCountry] = useState("ES");

  const domainHasValue = domain.trim().length > 0;
  const domainIsValid = isValidDomain(domain);
  const language = useMemo(() => COUNTRIES.find((c) => c.code === country)?.language ?? "es", [country]);
  const canSubmit = domainIsValid && country.trim().length > 0;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="space-y-2">
        <h2 className="text-lg font-semibold">Empieza por tu dominio</h2>
        <p className="sub">
          Indica tu dominio y mercado. El sistema sugerirá competidores y prompts relevantes con Gemini y lanzará
          automáticamente tu primer escaneo de visibilidad.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {errorMessage ? <p className="feedback error">{errorMessage}</p> : null}

        <div>
          <Label htmlFor="domain">Dominio</Label>
          <Input
            id="domain"
            name="domain"
            placeholder="ejemplo.com"
            value={domain}
            onChange={(event) => setDomain(event.target.value)}
            required
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
            name="country"
            value={country}
            onChange={(event) => setCountry(event.target.value)}
            className="mt-1 w-full rounded-[10px] border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--ink)]"
            required
          >
            {COUNTRIES.map((option) => (
              <option key={option.code} value={option.code}>
                {option.name}
              </option>
            ))}
          </select>
          <input type="hidden" name="language" value={language} />
        </div>

        <div className="rounded-[14px] border border-[var(--accent-soft-2)] bg-[var(--accent-soft)] p-4">
          <h4 className="text-sm font-semibold text-[var(--accent-ink)]">Qué ocurre a continuación</h4>
          <ol className="mt-2 space-y-1 text-sm text-[var(--ink-2)]">
            <li>1. Sugerimos competidores y prompts relevantes para tu dominio.</li>
            <li>2. Lanzamos el primer escaneo Gemini sobre esos prompts.</li>
            <li>3. Verás tu visión general con datos reales al terminar.</li>
          </ol>
        </div>

        <div className="flex items-center justify-end border-t border-[var(--line-soft)] pt-4">
          <Button type="submit" disabled={!canSubmit} className="inline-flex items-center gap-2">
            Crear dominio y escanear
            <Icon name="arrRight" size={16} />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
