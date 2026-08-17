import { describe, expect, it } from "vitest";
import { metadata as homeMetadata } from "../page";
import { metadata as pricingMetadata } from "./page";
import { PLANS } from "./plans-data";

/**
 * SEO-POS-1 (T1). Dos cosas que este test protege:
 *
 * 1. Que la home y `/pricing` sigan teniendo título, descripción y canonical
 *    propios. Los perdieron por ser componentes cliente enteros y nadie se dio
 *    cuenta hasta la auditoría de 2026-08-09; volver a marcar cualquiera de las
 *    dos como `"use client"` los borraría otra vez en silencio.
 * 2. Que los precios que la descripción de `/pricing` promete al buscador sean
 *    los reales de `plans-data.ts`. Un snippet con un precio viejo es la misma
 *    clase de mentira que PRICING-TRUTH-1 limpió de la página.
 */

function priceOf(planName: string): number {
  const plan = PLANS.find((p) => p.name.startsWith(planName));
  if (!plan) throw new Error(`Plan no encontrado: ${planName}`);
  return plan.price;
}

describe("metadata de la home", () => {
  it("tiene título propio, no el genérico del layout raíz", () => {
    expect(homeMetadata.title).toBeTruthy();
    expect(homeMetadata.title).not.toBe("GenScore");
  });

  it("declara su canonical absoluto", () => {
    expect(homeMetadata.alternates?.canonical).toBe("https://www.genscore.es");
  });

  it("tiene una descripción con longitud usable en el SERP", () => {
    const description = homeMetadata.description ?? "";
    expect(description.length).toBeGreaterThan(70);
  });

  it("no nombra motores que el producto no ejecuta", () => {
    const text = `${String(homeMetadata.title)} ${homeMetadata.description ?? ""}`;
    expect(text).not.toMatch(/Perplexity|AI Overviews/i);
  });
});

describe("metadata de /pricing", () => {
  it("tiene título propio y canonical absoluto", () => {
    expect(pricingMetadata.title).toBeTruthy();
    expect(pricingMetadata.title).not.toBe("GenScore");
    expect(pricingMetadata.alternates?.canonical).toBe(
      "https://www.genscore.es/pricing"
    );
  });

  it("cita los precios reales de plans-data", () => {
    const description = pricingMetadata.description ?? "";
    expect(description).toContain(`${priceOf("Starter")} €`);
    expect(description).toContain(`${priceOf("Pro")} €`);
  });

  it("no nombra motores que el producto no ejecuta", () => {
    const text = `${String(pricingMetadata.title)} ${pricingMetadata.description ?? ""}`;
    expect(text).not.toMatch(/Perplexity|AI Overviews/i);
  });
});
