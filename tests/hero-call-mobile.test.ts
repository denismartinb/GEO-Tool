import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const component = readFileSync("components/landing/hero-call-pill.tsx", "utf8");
const css = readFileSync("components/landing/hero-call-mobile.css", "utf8");
describe("mobile hero call layout", () => {
  it("keeps booking route and time calculation", () => {
    expect(component).toContain('href="/demo?desde=portada"');
    expect(component).toContain("listDemoSlots(new Date())[0]");
    expect(component).toContain("formatDemoSlotShort(first)");
    expect(component).toContain("Videollamada de 20 min");
    expect(component).toContain("Próximo hueco: ");
  });
  it("contains both availability states in their own slot wrapper", () => {
    expect(component).toContain('<span className="slot">{next}</span>');
    expect(component).toContain('<span className="slot">L–V, 18:00–21:00</span>');
  });
  it("keeps label visible and reserves mobile rows and arrow space", () => {
    expect(css).toContain('.lp-hero-call.lp-hero-call .k { display: block; grid-column: 2;');
    expect(css).toContain('.lp-hero-call.lp-hero-call .slot { white-space: nowrap; }');
    expect(css).toContain('grid-template-columns: 6px auto');
    expect(css).toContain('right: 14px');
    expect(css).toContain('grid-template-columns: repeat(4, minmax(0, 1fr))');
    expect(css).toContain('text-align: center');
  });
});
