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
  it("keeps label visible, centers content and hides only mobile arrow", () => {
    expect(css).toContain('.lp-hero-call.lp-hero-call .k { display: block; grid-column: 2;');
    expect(css).toContain('.lp-hero-call.lp-hero-call .slot { white-space: nowrap; }');
    expect(css).toContain('grid-template-columns: 6px auto auto');
    expect(css).toContain('padding: 10px 16px');
    expect(css).toContain('.lp-hero-call.lp-hero-call .arr { display: none; }');
    expect(css).toContain('flex-wrap: nowrap');
    expect(css).toContain('flex-direction: row');
    expect(css).toContain('font-size: 11.5px');
    expect(css).toContain('margin-left: auto');
  });
});
