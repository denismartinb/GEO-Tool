import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BrandIdentityCard } from "./brand-identity-card";
import { DescriptionPrompt, shouldAskForDescription } from "./description-prompt";
import { ClampedPromptText } from "./clamped-prompt-text";
import { PromptsContext } from "./prompts-context";

/**
 * ONBOARDING-IDENTITY-1 — render de las piezas del asistente. El entorno es
 * `node` + `renderToStaticMarkup` (sin DOM), así que se prueba lo que SE
 * PINTA para cada entrada; la cadena de «portada bloqueada → motivo» la cubre
 * `app/dashboard/projects/actions.suggest.test.ts`.
 */

const noop = () => {};

describe("DescriptionPrompt · portada bloqueada", () => {
  it("con el motivo homepage_unreadable aparece el campo de descripción", () => {
    const html = renderToStaticMarkup(
      <DescriptionPrompt reason="homepage_unreadable" value="" onChange={noop} onSubmit={noop} onSkip={noop} pending={false} />
    );
    expect(html).toContain('name="business_description"');
    expect(html).toContain("No hemos podido leer tu web");
    expect(html).toContain("Continuar sin sugerencias");
  });

  it("no aparece si el fallo fue de nuestro modelo, ni si se identificó", () => {
    for (const reason of ["profile_failed", "profile_low_confidence", null, undefined] as const) {
      const html = renderToStaticMarkup(
        <DescriptionPrompt reason={reason} value="" onChange={noop} onSubmit={noop} onSkip={noop} pending={false} />
      );
      expect(html).toBe("");
      expect(shouldAskForDescription(reason)).toBe(false);
    }
  });

  it("no deja generar con una descripción de relleno", () => {
    const short = renderToStaticMarkup(
      <DescriptionPrompt reason="homepage_unreadable" value="tienda" onChange={noop} onSubmit={noop} onSkip={noop} pending={false} />
    );
    expect(short).toMatch(/<button[^>]*disabled=""[^>]*>Generar con esta descripción/);
    const ok = renderToStaticMarkup(
      <DescriptionPrompt
        reason="homepage_unreadable"
        value="Grandes almacenes españoles: moda, electrónica y hogar."
        onChange={noop}
        onSubmit={noop}
        onSkip={noop}
        pending={false}
      />
    );
    expect(ok).not.toMatch(/<button[^>]*disabled=""[^>]*>Generar con esta descripción/);
  });
});

describe("BrandIdentityCard", () => {
  const base = { onBrandChange: noop, onAliasesChange: vi.fn(), onConfirmBrand: noop, domain: "elcorteingles.es" };

  it("pendiente: campo, mensaje breve, botón «Confirmar nombre» PROPIO y dominio como línea secundaria", () => {
    const html = renderToStaticMarkup(
      <BrandIdentityCard {...base} brand="Elcorteingles" pending aliases={[]} aliasesAutoFound={0} />
    );
    expect(html).toContain("Confirma tu marca");
    expect(html).toContain('id="brand-name"');
    expect(html).toContain('value="Elcorteingles"');
    expect(html).toContain("Revisa cómo se escribe tu marca");
    expect(html).toContain('aria-describedby="brand-pending"');
    // El botón es un <button> hermano del campo, NO un enlace dentro de una frase.
    expect(html).toMatch(/<button[^>]*class="[^"]*onb2-confirm[^"]*"[^>]*>Confirmar nombre<\/button>/);
    expect(html).not.toMatch(/<p[^>]*>[^<]*<button[^>]*>Confirmar nombre/);
    expect(html).toContain('class="onb2-brand-domain mono"');
    expect(html).not.toContain("Identidad pendiente de confirmar");
    expect(html).not.toContain("El nombre es correcto");
  });

  it("confirmado: sin mensaje ni botón de confirmar", () => {
    const html = renderToStaticMarkup(
      <BrandIdentityCard {...base} brand="El Corte Inglés" pending={false} aliases={[]} aliasesAutoFound={0} />
    );
    expect(html).not.toContain("Revisa cómo se escribe tu marca");
    expect(html).not.toContain("Confirmar nombre");
    expect(html).not.toContain("brand-pending");
  });

  it("los alias van en un detalle: ABIERTO si hay propuestos y cerrado si no hay ninguno", () => {
    const withProposals = renderToStaticMarkup(
      <BrandIdentityCard {...base} brand="El Corte Inglés" pending={false} aliases={["Club del Gourmet"]} aliasesAutoFound={1} />
    );
    expect(withProposals).toMatch(/<details[^>]*class="onb2-alias-details"[^>]*open=""/);
    expect(withProposals).toContain("Propuestos a partir de tu web (1)");
    expect(withProposals).toContain('aria-label="Quitar alias Club del Gourmet"');
    const none = renderToStaticMarkup(
      <BrandIdentityCard {...base} brand="Elcorteingles" pending aliases={[]} aliasesAutoFound={0} />
    );
    expect(none).not.toMatch(/<details[^>]*onb2-alias-details[^>]*open/);
    expect(none).toContain("No hemos encontrado ninguno en tu web");
  });

  it("el campo de alias tiene etiqueta accesible aunque no se vea", () => {
    const html = renderToStaticMarkup(
      <BrandIdentityCard {...base} brand="X" pending={false} aliases={[]} aliasesAutoFound={0} />
    );
    expect(html).toMatch(/<label[^>]*for="brand-alias"[^>]*>Añadir otro nombre<\/label>/);
  });
});

describe("PromptsContext", () => {
  const options = [
    { code: "es", name: "Español" },
    { code: "en", name: "Inglés" }
  ];
  const mix = { total: 15, informational: 12, commercial: 2, local: 1, branded: 0 };

  it("país e idioma son dos campos del mismo sistema visual, con etiqueta y selector manual", () => {
    const html = renderToStaticMarkup(
      <PromptsContext countryName="España" language="es" languageOptions={options} languageDetected onLanguageChange={noop} mix={mix} />
    );
    expect((html.match(/class="field-sel[ "]/g) ?? []).length).toBe(2);
    expect(html).toContain("España");
    expect(html).toContain("Idioma (detectado)");
    expect(html).toContain('id="prompts-language"');
    expect(html).toContain('aria-label="Idioma de las preguntas"');
    expect(html).toContain('<option value="en">Inglés</option>');
  });

  it("lo visible es el aviso corto; el recuento estimado y las notas técnicas van bajo «Cómo se han elegido»", () => {
    const html = renderToStaticMarkup(
      <PromptsContext countryName="España" language="es" languageOptions={options} languageDetected onLanguageChange={noop} mix={mix} />
    );
    expect(html).toContain("Preguntas propuestas por IA, sin volumen de búsqueda medido.");
    const outside = html.slice(0, html.indexOf("<details"));
    expect(outside).not.toContain("Estimado:");
    const inside = html.slice(html.indexOf("<details"));
    expect(inside).toContain("Cómo se han elegido");
    expect(inside).toContain("12 informativas");
    expect(inside).toContain("no búsquedas reales");
    expect(inside).toContain("no una garantía estadística");
  });

  it("si la persona cambia el idioma deja de decir «detectado»", () => {
    const html = renderToStaticMarkup(
      <PromptsContext countryName="España" language="en" languageOptions={options} languageDetected={false} onLanguageChange={noop} mix={mix} />
    );
    expect(html).not.toContain("(detectado)");
  });

  it("avisa, a la vista, cuando ninguna pregunta es local", () => {
    const html = renderToStaticMarkup(
      <PromptsContext
        countryName="España"
        language="es"
        languageOptions={options}
        languageDetected
        onLanguageChange={noop}
        mix={{ total: 15, informational: 13, commercial: 2, local: 0, branded: 0 }}
      />
    );
    const outside = html.slice(0, html.indexOf("<details"));
    expect(outside).toContain("Ninguna es local");
  });
});

describe("ClampedPromptText", () => {
  it("pinta el texto completo en el DOM (el recorte es de CSS) y nunca inventa «Ver completo» sin medir", () => {
    const text = "¿Cuál es la mejor tienda online especializada en electrónica de consumo, informática y electrodomésticos?";
    const html = renderToStaticMarkup(<ClampedPromptText text={text} onExpand={noop} expandLabel="Ver el prompt 1 completo" />);
    expect(html).toContain(text);
    expect(html).toContain('class="onb2-ptext"');
    expect(html).not.toContain("Ver completo");
  });

  it("un prompt vacío se ve como «Prompt vacío»", () => {
    const html = renderToStaticMarkup(<ClampedPromptText text="" onExpand={noop} expandLabel="x" />);
    expect(html).toContain("Prompt vacío");
  });
});
