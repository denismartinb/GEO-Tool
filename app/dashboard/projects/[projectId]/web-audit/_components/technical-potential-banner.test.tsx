import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TechnicalPotentialBanner } from "./technical-potential-banner";

/**
 * Ver la cabecera de `issue-rows.test.tsx` para por qué se renderiza de
 * verdad con `react-dom/server` y qué se asegura (contenido) y qué no
 * (aspecto, que es del `ux-pilot`).
 */
describe("TechnicalPotentialBanner", () => {
  it("publica el recuento de problemas y los dos scores", () => {
    const html = renderToStaticMarkup(<TechnicalPotentialBanner issueCount={4} fromScore={88} toScore={100} />);
    expect(html).toContain("Si arreglas los 4 problemas técnicos");
    expect(html).toContain(">88<");
    expect(html).toContain(">100<");
    expect(html).toContain("calculado");
  });

  it("pluraliza a singular cuando sólo hay un problema", () => {
    const html = renderToStaticMarkup(<TechnicalPotentialBanner issueCount={1} fromScore={95} toScore={97} />);
    expect(html).toContain("Si arreglas los 1 problema técnico");
    expect(html).not.toContain("1 problemas técnicos");
  });
});
