import { describe, expect, it } from "vitest";
import { controlLabel } from "./explore";

/**
 * The pilot's own ENAMETOOLONG failure (PR #295): `testInfo.attach` turns the
 * control label into a filename, so an unbounded label is an unbounded
 * filename. Every case here is about the label staying short enough to be one.
 */
describe("controlLabel", () => {
  const FALLBACK = "overview control #3";

  it("bounds a long aria-label — the case that failed the pilot", () => {
    const realAriaLabel =
      "Media simple de tus señales disponibles: cobertura de temas, temas implementados/citados por la IA y salud técnica. " +
      "Cada componente se muestra al lado — un componente sin auditar no cuenta como 0, simplemente no entra en la media";

    const label = controlLabel(realAriaLabel, null, FALLBACK);

    expect(label.length).toBeLessThanOrEqual(60);
    // Even at 3 bytes per character, the result must fit a 255-byte filename
    // with room to spare for the screen name and viewport suffix around it.
    expect(Buffer.byteLength(label, "utf8")).toBeLessThan(200);
    expect(realAriaLabel.startsWith(label)).toBe(true);
  });

  it("bounds a long textContent too", () => {
    const label = controlLabel(null, "x".repeat(500), FALLBACK);
    expect(label).toBe("x".repeat(60));
  });

  it("prefers aria-label over textContent", () => {
    expect(controlLabel("Cerrar", "×", FALLBACK)).toBe("Cerrar");
  });

  it("falls back through blank and whitespace-only values", () => {
    expect(controlLabel(null, "Ver detalle", FALLBACK)).toBe("Ver detalle");
    expect(controlLabel("", "Ver detalle", FALLBACK)).toBe("Ver detalle");
    expect(controlLabel("   ", "Ver detalle", FALLBACK)).toBe("Ver detalle");
    expect(controlLabel(null, null, FALLBACK)).toBe(FALLBACK);
    expect(controlLabel("", "  ", FALLBACK)).toBe(FALLBACK);
  });

  it("trims surrounding whitespace so labels are stable across renders", () => {
    expect(controlLabel(null, "\n  Escanear ahora  \n", FALLBACK)).toBe("Escanear ahora");
  });
});
