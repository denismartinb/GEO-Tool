import { describe, expect, it } from "vitest";
import { bandOf, firstNameFromMetadata, greeting, leadParts, scoreHeadline, type LeadPart } from "./overview-copy";

const text = (parts: LeadPart[]) => parts.map((p) => (typeof p === "string" ? p : p.text)).join("");

describe("greeting", () => {
  it("follows the hour", () => {
    expect(greeting(9)).toBe("Buenos días.");
    expect(greeting(13)).toBe("Buenas tardes.");
    expect(greeting(22)).toBe("Buenas noches.");
    expect(greeting(3)).toBe("Buenas noches.");
  });
});

describe("leadParts", () => {
  it("names the rival that is ahead and the plan size", () => {
    const t = text(
      leadParts({ mentionRate: 41, marginPoints: null, claim: { kind: "behind", competitor: "Cuentix", competitorRate: 54 }, planCount: 4 })
    );
    expect(t).toBe("Apareces en el 41% de las respuestas. Cuentix te supera con un 54%. Tienes 4 acciones para esta semana.");
  });

  it("shows the margin when the sample is thin and drops the plan sentence without actions", () => {
    const t = text(leadParts({ mentionRate: 20, marginPoints: 11.4, claim: { kind: "no_competitors" }, planCount: 0 }));
    expect(t).toContain("20% de las respuestas (±11).");
    expect(t).not.toContain("Tienes");
  });

  it("never claims leadership on a thin sample", () => {
    const t = text(leadParts({ mentionRate: 30, marginPoints: null, claim: { kind: "ahead_small_sample" }, planCount: 1 }));
    expect(t).not.toContain("mayor visibilidad");
    expect(t).toContain("no es concluyente");
    expect(t).toContain("1 acción para");
  });

  it("says plainly that nobody is named", () => {
    const t = text(leadParts({ mentionRate: 0, marginPoints: null, claim: { kind: "nobody_named" }, planCount: 0 }));
    expect(t).toBe("Todavía no apareces en las respuestas. Tampoco nombra a tus competidores.");
  });
});

describe("scoreHeadline", () => {
  it("only says leader for a real leader", () => {
    expect(scoreHeadline(40, { kind: "leader" })).toBe("La IA ya te nombra más que a tus rivales.");
    expect(scoreHeadline(40, { kind: "ahead_small_sample" })).not.toContain("más que");
    expect(scoreHeadline(40, { kind: "no_competitors" })).not.toContain("más que");
  });
  it("does not say the AI names the brand when it does not", () => {
    expect(scoreHeadline(0, { kind: "behind", competitor: "X", competitorRate: 10 })).toBe("La IA todavía no te nombra.");
  });
});

describe("bandOf", () => {
  it("uses the 40 and 70 cuts", () => {
    expect(bandOf(39)).toBe("initial");
    expect(bandOf(40)).toBe("emerging");
    expect(bandOf(70)).toBe("competitive");
  });
});

describe("greeting with a name", () => {
  it("adds the first name when the account has one", () => {
    expect(greeting(15, "Denis")).toBe("Buenas tardes, Denis.");
    expect(firstNameFromMetadata({ full_name: "Denis Martín" })).toBe("Denis");
    expect(firstNameFromMetadata({ given_name: "Ana", full_name: "Ana Ruiz" })).toBe("Ana");
  });
  it("never invents one", () => {
    expect(firstNameFromMetadata({})).toBeNull();
    expect(firstNameFromMetadata(null)).toBeNull();
    expect(greeting(15, null)).toBe("Buenas tardes.");
  });
});
