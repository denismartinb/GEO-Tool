import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ONBOARDING-RESPONSIVE-1 (log §237) — contratos a nivel de fuente.
 *
 * Un test de texto NO ve el layout: lo que prueba el comportamiento en móvil es
 * medir en un navegador (evidencia en `docs/evidence/onboarding-responsive-local/`).
 * Esto solo impide que vuelvan, sin que salte nada, las dos causas que lo rompían:
 *  - `1fr` a secas en la rejilla móvil (ensanchaba la columna a ~427px);
 *  - estilos EN LÍNEA en el TSX, que ningún `@media` puede sobrescribir (el nombre
 *    del país y el contenedor del texto de cada prompt se colapsaban).
 */
const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
const wizard = readFileSync(join(process.cwd(), "components/onboarding-wizard.tsx"), "utf8");
const context = readFileSync(join(process.cwd(), "components/onboarding/prompts-context.tsx"), "utf8");

describe("asistente de alta en móvil", () => {
  it("la rejilla de una columna usa minmax(0, 1fr)", () => {
    expect(css).toMatch(/\.onb2-grid \{ grid-template-columns: minmax\(0, 1fr\); \}/);
    expect(css).not.toMatch(/\.onb2-grid \{ grid-template-columns: 1fr; \}/);
  });

  it("el nombre del país se vuelve a mostrar en el asistente, acotado a .onb2-scope", () => {
    expect(css).toMatch(/\.onb2-scope \.country-sel-name \{ display: inline; \}/);
  });

  it("el texto del país y el del prompt no llevan estilos en línea que bloqueen el @media", () => {
    expect(wizard).not.toMatch(/maxWidth: 96/);
    expect(wizard).not.toMatch(/flexDirection: "column", gap: 2/);
    expect(wizard).toContain('className="country-sel-name"');
    expect(wizard).toContain('className="onb2-ptext-wrap"');
    expect(context).not.toMatch(/minHeight: 32/);
  });

  it("las filas de prompt llevan su propio modificador y el texto no se recorta en móvil", () => {
    expect(wizard).toContain("onb2-row--prompt");
    expect(css).toMatch(/\.onb2-scope \.onb2-ptext \{ overflow: visible; text-overflow: clip; white-space: normal;/);
  });

  it("el editor de un prompt abierto ocupa la fila entera en móvil (sin estilo en línea que gane al @media)", () => {
    expect(wizard).toContain('className="onb2-pedit"');
    expect(wizard).not.toMatch(/<div style=\{\{ flex: 1, minWidth: 0 \}\}>\s*<Textarea/);
    expect(css).toMatch(/\.onb2-scope \.onb2-row--prompt > \.onb2-pedit \{ flex: 1 1 100%; \}/);
  });

  it("los objetivos de 44px cubren hasta 760px y la × amplía solo el área pulsable", () => {
    expect(css).toMatch(/@media \(max-width: 760px\) \{\n  \.onb2-scope \.onb2-iconbtn \{ width: 44px; height: 44px; \}/);
    expect(css).toMatch(/\.onb2-scope \.eng-chip button::after \{ content: ""; position: absolute; inset: -10px; \}/);
  });
});
