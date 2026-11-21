import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

let shell: { inApp: boolean } | null = null;
vi.mock("@/components/ins/shell-context", () => ({ useOptionalShellData: () => shell }));

import { GuideLink } from "./card-parts";

describe("GuideLink (RECS-GUIDES-1)", () => {
  it("enlaza la guía del blog de su tipo en una pestaña nueva", () => {
    shell = { inApp: false };
    const html = renderToStaticMarkup(<GuideLink type="pursue_media_sources" />);
    expect(html).toContain('href="/blog/que-fuentes-cita-la-ia?desde=recomendaciones"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain("Cómo hacerlo");
  });

  it("no sale dentro de la app de Android ni en un tipo sin guía", () => {
    shell = { inApp: true };
    expect(renderToStaticMarkup(<GuideLink type="pursue_media_sources" />)).toBe("");
    shell = null;
    expect(renderToStaticMarkup(<GuideLink type="amplify_positive_pattern" />)).toBe("");
  });
});
