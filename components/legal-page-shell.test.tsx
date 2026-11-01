import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * APP-LEGAL-1 (log §400). Inside the Android app the legal pages must not show
 * anything that sells: no public header (launch-price strip, «Precios») and no
 * public footer (pricing link, payment logos). Google Play rejects it.
 */
const inApp = vi.hoisted(() => ({ value: false }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/app-mode-server", () => ({ isInApp: async () => inApp.value }));
vi.mock("@/components/marketing/public-header", () => ({ PublicHeader: () => <div>PUBLIC_HEADER</div> }));
vi.mock("@/components/marketing/public-footer", () => ({ PublicFooter: () => <div>PUBLIC_FOOTER</div> }));

import { LegalPageShell } from "./legal-page-shell";
import TerminosPage from "@/app/terminos/page";

async function render(node: Promise<React.ReactElement> | React.ReactElement) {
  return renderToStaticMarkup(await node);
}

describe("páginas legales dentro de la app", () => {
  beforeEach(() => {
    inApp.value = false;
  });

  it("en la web llevan la cabecera y el pie públicos", async () => {
    const html = await render(LegalPageShell({ title: "T", updated: "hoy", activeHref: "/terminos", children: <p>x</p> }));
    expect(html).toContain("PUBLIC_HEADER");
    expect(html).toContain("PUBLIC_FOOTER");
  });

  it("en la app no llevan cabecera ni pie públicos, y sí una vuelta al acceso", async () => {
    inApp.value = true;
    const html = await render(LegalPageShell({ title: "T", updated: "hoy", activeHref: "/terminos", children: <p>x</p> }));
    expect(html).not.toContain("PUBLIC_HEADER");
    expect(html).not.toContain("PUBLIC_FOOTER");
    expect(html).toContain('href="/login"');
  });

  it("los términos no enlazan a precios dentro de la app", async () => {
    inApp.value = true;
    // The page returns <LegalPageShell>; its body is what we check.
    const body = async () => renderToStaticMarkup(<>{(await TerminosPage()).props.children}</>);
    const inside = await body();
    expect(inside).not.toContain('href="/precios"');
    inApp.value = false;
    const outside = await body();
    expect(outside).toContain('href="/precios"');
  });
});
