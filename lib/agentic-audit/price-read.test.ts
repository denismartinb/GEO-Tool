import { describe, expect, it } from "vitest";
import { declaredPriceConflicts, parseAmount, readVisiblePrice, stockConflicts, visiblePrices } from "./price-read";

describe("readVisiblePrice (AGENTS-TRUTH-1, log §464)", () => {
  it("keeps the unit: energy, month and year", () => {
    expect(readVisiblePrice("Energía 0,1499 €/kWh").text).toBe("0,1499 €/kWh");
    expect(readVisiblePrice("Suscripción 33,90 € al mes").text).toBe("33,90 €/mes");
    expect(readVisiblePrice("Seguro desde 160 €/año").text).toBe("Desde 160 €/año");
  });

  it("never shows the power price when the energy price is there (Iberdrola)", () => {
    expect(readVisiblePrice("Potencia 0,12 €/kW día. Energía 0,1499 €/kWh").text).toBe("0,1499 €/kWh");
  });

  it("drops a free plan when a paid one exists (Holded) and absurd figures (Naturgy)", () => {
    expect(readVisiblePrice("Gratis 0 EUR. Básico 29 € al mes").text).toBe("29 €/mes");
    expect(readVisiblePrice("Más de 148000 € ahorrados por nuestros clientes. Tarifa 59 €").text).toBe("59 €");
  });

  it("does not take a saving for the price", () => {
    expect(readVisiblePrice("Ahorra hasta 120 € al año. Precio 45 €").text).toBe("45 €");
  });

  it("says «Varios precios, desde» with three or more prices", () => {
    expect(readVisiblePrice("Plan A 129,50 €. Plan B 149,50 €. Plan C 164,50 €").text).toBe("Varios precios, desde 129,50 €");
  });

  it("reads Spanish and dotted amounts", () => {
    expect(parseAmount("1.234,56")).toBe(1234.56);
    expect(parseAmount("1.234")).toBe(1234);
    expect(parseAmount("0.1499")).toBe(0.1499);
    expect(visiblePrices("Nada que ver")).toEqual([]);
  });

  it("flags a declared price the page does not show, and stock the text denies (Domestika, Druni)", () => {
    const shown = visiblePrices("164,50 € al año");
    expect(declaredPriceConflicts(149.5, shown)).toBe(true);
    expect(declaredPriceConflicts(164.5, shown)).toBe(false);
    expect(declaredPriceConflicts(149.5, [])).toBe(false);
    expect(stockConflicts("En stock", "Este producto no está disponible")).toBe(true);
    expect(stockConflicts("En stock", "Recíbelo mañana")).toBe(false);
  });
});
