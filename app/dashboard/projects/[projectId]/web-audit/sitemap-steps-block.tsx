import type { SitemapStep } from "@/lib/web-audit/sitemap";

/**
 * WEB-AUDIT-SITEMAP-1 — qué hacer cuando no hay sitemap.
 *
 * Server component a propósito, al revés que `LlmsTxtBlock`: aquí no hay nada
 * que copiar al portapapeles ni que descargar, así que no necesita hidratarse.
 * El fragmento de `robots.txt` es una sola línea que se selecciona a mano sin
 * esfuerzo, y añadir un botón de copiar habría obligado a `"use client"` para
 * ahorrar un doble clic.
 *
 * Reutiliza el chrome de `.wa2-llms-*` sin renombrarlo: son los mismos pasos
 * numerados, y duplicar el CSS con otro prefijo sólo crearía dos sitios donde
 * arreglar el mismo espaciado.
 */
export function SitemapStepsBlock({ steps }: { steps: SitemapStep[] }) {
  return (
    <ol className="wa2-llms-steps" style={{ margin: "4px 0 10px" }}>
      {steps.map((step, i) => (
        <li key={step.title} className="wa2-llms-step">
          <span className="wa2-llms-num" aria-hidden="true">
            {i + 1}
          </span>
          <div className="wa2-llms-step-body">
            <span className="wa2-llms-step-title">{step.title}</span>
            <p className="wa2-llms-step-text">{step.body}</p>
            {step.code && <code className="wa2-llms-code">{step.code}</code>}
          </div>
        </li>
      ))}
    </ol>
  );
}
