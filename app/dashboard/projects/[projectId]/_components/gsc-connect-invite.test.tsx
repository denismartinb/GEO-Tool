import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GscConnectPanel, GscConnectRow } from "./gsc-connect-invite";

const P = "11111111-1111-4111-8111-111111111111";

describe("Search Console invitation (GSC-CONNECT-CTA-1, log §311)", () => {
  it("sends both surfaces straight to Google's consent screen", () => {
    for (const html of [
      renderToStaticMarkup(<GscConnectPanel projectId={P} state="disconnected" />),
      renderToStaticMarkup(<GscConnectRow projectId={P} state="disconnected" />)
    ]) {
      expect(html).toContain(`href="/api/search-console/connect?projectId=${P}"`);
      expect(html).toContain("Conectar con Google");
    }
  });

  it("keeps the Recomendaciones row in the Google row's place, with its source chip", () => {
    const html = renderToStaticMarkup(<GscConnectRow projectId={P} state="disconnected" />);
    expect(html).toContain("Con tus datos de Google");
    expect(html).toContain("rec2-src-g");
    expect(html).toContain("Subir a la página 1");
  });

  it("asks to reconnect when the connection was lost", () => {
    expect(renderToStaticMarkup(<GscConnectPanel projectId={P} state="reconnect" />)).toContain("Volver a conectar");
    expect(renderToStaticMarkup(<GscConnectRow projectId={P} state="reconnect" />)).toContain("Volver a conectar");
  });

  it("never shows a figure: there is no Google data yet", () => {
    for (const state of ["disconnected", "reconnect"] as const) {
      const text = [
        renderToStaticMarkup(<GscConnectPanel projectId={P} state={state} />),
        renderToStaticMarkup(<GscConnectRow projectId={P} state={state} />)
      ]
        .join("")
        .replace(/<[^>]*>/g, "")
        // "la página 1" names Google's first page, not a measurement.
        .replace(/página 1/g, "");
      expect(text).not.toMatch(/\d/);
      expect(text).not.toContain("—");
    }
  });
});
