import { describe, expect, it } from "vitest";
import { deriveControlLabel } from "./explore";

describe("deriveControlLabel", () => {
  it("caps a long aria-label at 60 chars — the bug this guards against", () => {
    const longLabel =
      "Media simple de tus señales disponibles: cobertura de temas, temas implementados, citados por la IA y salud técnica";
    expect(longLabel.length).toBeGreaterThan(60);
    const result = deriveControlLabel(longLabel, null, "fallback");
    expect(result.length).toBeLessThanOrEqual(60);
    expect(result).toBe(longLabel.slice(0, 60));
  });

  it("caps a long textContent fallback at 60 chars", () => {
    const longText = "x".repeat(200);
    const result = deriveControlLabel(null, longText, "fallback");
    expect(result.length).toBeLessThanOrEqual(60);
  });

  it("prefers a short aria-label over textContent", () => {
    expect(deriveControlLabel("Cerrar", "algo distinto", "fallback")).toBe("Cerrar");
  });

  it("falls back to textContent when aria-label is null or blank", () => {
    expect(deriveControlLabel(null, "Ver detalle", "fallback")).toBe("Ver detalle");
    expect(deriveControlLabel("   ", "Ver detalle", "fallback")).toBe("Ver detalle");
  });

  it("falls back to the provided fallback when both are null or blank", () => {
    expect(deriveControlLabel(null, null, "web-audit control #3")).toBe("web-audit control #3");
    expect(deriveControlLabel("  ", "  ", "web-audit control #3")).toBe("web-audit control #3");
  });
});
