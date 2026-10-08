import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BrandIdentityCard } from "./brand-identity-card";
import { DescriptionPrompt, shouldAskForDescription } from "./description-prompt";

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

  it("muestra el nombre editable, el dominio aparte y el aviso de identidad pendiente", () => {
    const html = renderToStaticMarkup(
      <BrandIdentityCard {...base} brand="Elcorteingles" pending aliases={[]} aliasesAutoFound={0} />
    );
    expect(html).toContain('id="brand-name"');
    expect(html).toContain('value="Elcorteingles"');
    expect(html).toContain("elcorteingles.es");
    expect(html).toContain("Identidad pendiente de confirmar");
    expect(html).toContain("No hemos encontrado ninguno en tu web");
    expect(html).toContain("El nombre es correcto");
  });

  it("sin pendiente no avisa, y enseña los alias propuestos con su botón de quitar accesible", () => {
    const html = renderToStaticMarkup(
      <BrandIdentityCard {...base} brand="El Corte Inglés" pending={false} aliases={["Club del Gourmet"]} aliasesAutoFound={1} />
    );
    expect(html).not.toContain("Identidad pendiente de confirmar");
    expect(html).toContain("Propuestos a partir de tu web (1)");
    expect(html).toContain('aria-label="Quitar alias Club del Gourmet"');
  });
});
