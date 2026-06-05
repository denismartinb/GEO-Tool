"use client";

import { useEffect, useState } from "react";

const SCAN_STEPS = [
  "Leyendo el contenido de {domain}",
  "Ejecutando prompts en Gemini",
  "Extrayendo menciones y citas",
  "Comparando con competidores configurados",
  "Calculando la puntuación de visibilidad GEO",
  "Generando recomendaciones",
];

export function ScanLoadingState({ domain }: { domain: string }) {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    if (activeStep >= SCAN_STEPS.length) return;
    const t = setTimeout(() => setActiveStep((s) => s + 1), 1800);
    return () => clearTimeout(t);
  }, [activeStep]);

  const steps = SCAN_STEPS.map((s) => s.replace("{domain}", domain));
  const pct = Math.min(95, Math.round((activeStep / steps.length) * 100));

  return (
    <div className="flex min-h-[440px] items-center justify-center py-8">
      <div
        className="w-full max-w-md rounded-[20px] border bg-white p-8"
        style={{ borderColor: "var(--line)", boxShadow: "0 4px 20px rgba(16,24,40,.07)" }}
      >
        {/* Spinner */}
        <div className="mb-5 flex justify-center">
          <div
            className="h-[26px] w-[26px] animate-spin rounded-full"
            style={{ border: "3px solid var(--line)", borderTopColor: "var(--accent)" }}
          />
        </div>

        <h2
          className="mb-1 text-center text-xl font-bold tracking-tight"
          style={{ color: "var(--ink)" }}
        >
          Escaneo de visibilidad en curso
        </h2>
        <p className="mb-6 text-center text-sm" style={{ color: "var(--ink-3)" }}>
          Esto suele tardar un par de minutos. Puedes salir de esta página — seguiremos trabajando.
        </p>

        {/* Steps */}
        <div className="space-y-2.5">
          {steps.map((step, i) => {
            const done = i < activeStep;
            const active = i === activeStep;

            return (
              <div
                key={i}
                className="flex items-center gap-3 text-sm transition-colors"
                style={{
                  color: active ? "var(--ink)" : "var(--ink-4)",
                  opacity: i > activeStep ? 0.4 : 1,
                  fontWeight: active ? 600 : 400,
                }}
              >
                <span
                  className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-xs"
                  style={{
                    background: done ? "#e7f6ee" : active ? "var(--accent-soft)" : "var(--line)",
                    color: done ? "#0d6b41" : active ? "var(--accent-ink)" : "var(--ink-4)",
                  }}
                >
                  {done ? (
                    "✓"
                  ) : active ? (
                    <span
                      className="h-1.5 w-1.5 animate-pulse rounded-full"
                      style={{ backgroundColor: "var(--accent)" }}
                    />
                  ) : (
                    i + 1
                  )}
                </span>
                <span className="flex-1">{step}</span>
                {active && (
                  <span
                    className="text-xs font-semibold"
                    style={{ color: "var(--accent-ink)" }}
                  >
                    trabajando…
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Progress bar */}
        <div className="mt-6">
          <div
            className="h-1.5 overflow-hidden rounded-full"
            style={{ backgroundColor: "var(--line)" }}
          >
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${pct}%`, backgroundColor: "var(--accent)" }}
            />
          </div>
          <p
            className="mt-2 text-center text-xs"
            style={{ color: "var(--ink-4)", fontFamily: "ui-monospace, monospace" }}
          >
            {pct}% · {Math.min(activeStep + 1, steps.length)} de {steps.length} pasos
          </p>
        </div>
      </div>
    </div>
  );
}
