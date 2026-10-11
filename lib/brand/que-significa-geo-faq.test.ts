import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { QUE_SIGNIFICA_GEO_FAQ } from "./que-significa-geo-faq";

const page = readFileSync("app/geo/page.tsx", "utf8");

describe("«¿Qué significa GEO?» on /geo (log §290)", () => {
  it("answers the target query in the first question, with both meanings", () => {
    const [first] = QUE_SIGNIFICA_GEO_FAQ;
    expect(first.question).toBe("¿Qué significa GEO?");
    expect(first.answer).toContain("Generative Engine Optimization");
    expect(first.answer).toContain("tierra");
  });

  it("says GEO is not geolocation, the reading engines default to (log §265)", () => {
    expect(QUE_SIGNIFICA_GEO_FAQ.some((f) => /geolocalización/.test(f.question + f.answer))).toBe(true);
  });

  it("renders the same pairs it declares as FAQPage, never a second copy", () => {
    expect(page).toContain("<FaqPageSchema items={QUE_SIGNIFICA_GEO_FAQ} />");
    expect(page).toContain("QUE_SIGNIFICA_GEO_FAQ.map(");
  });

  it("puts the question in the H1", () => {
    expect(page).toMatch(/<h1 className="lp-h1">¿Qué significa <span className="grad">GEO<\/span>\?<\/h1>/);
  });

  it("names only engines the product runs", () => {
    const text = QUE_SIGNIFICA_GEO_FAQ.map((f) => f.answer).join(" ");
    expect(text).not.toMatch(/Copilot|AI Overviews|Vistas creadas/);
  });
});
