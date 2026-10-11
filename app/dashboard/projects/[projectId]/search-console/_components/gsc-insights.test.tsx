import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GscCannibal, GscCtr, GscDevices, GscPages } from "./gsc-insights";
import { GscPosition } from "./gsc-position";
import { TIERS } from "@/lib/search-console/insights";

const AUDIT = "/dashboard/projects/p/web-audit?bloque=seo";

describe("GscPages", () => {
  it("shows each page's audit state as it came in", () => {
    const html = renderToStaticMarkup(
      <GscPages
        auditHref={AUDIT}
        pages={[
          { page: "https://acme.com/precios", path: "/precios", clicks: 12, impressions: 300, position: 4.2, queryCount: 3, audit: { kind: "issues", count: 2 } },
          { page: "https://acme.com/", path: "/", clicks: 40, impressions: 900, position: 2, queryCount: 9, audit: { kind: "ok" } },
          { page: "https://acme.com/blog", path: "/blog", clicks: 1, impressions: 50, position: 14, queryCount: 1, audit: { kind: "unaudited" } }
        ]}
      />
    );
    expect(html).toContain("2 problemas SEO");
    expect(html).toContain("Correcta");
    expect(html).toContain("Sin auditar");
    expect(html).toContain(`href="${AUDIT.replace("&", "&amp;")}"`);
  });
  it("renders nothing without pages", () => {
    expect(renderToStaticMarkup(<GscPages auditHref={AUDIT} pages={[]} />)).toBe("");
  });
  it("never turns a non-web URL into a link", () => {
    const html = renderToStaticMarkup(
      <GscCannibal
        items={[
          {
            query: "x",
            impressions: 100,
            pages: [
              { page: "javascript:alert(1)", path: "evil", position: 3, share: 0.5 },
              { page: "https://acme.com/b", path: "/b", position: 5, share: 0.5 }
            ]
          }
        ]}
      />
    );
    expect(html).not.toContain("javascript:");
    expect(html).toContain('href="https://acme.com/b"');
  });
});

describe("GscCtr", () => {
  it("compares with the site's own CTR, and says so", () => {
    const html = renderToStaticMarkup(
      <GscCtr items={[{ query: "precio geo", position: 3.2, impressions: 1240, ctr: 0.008, benchmark: 0.1, page: "https://acme.com/precios" }]} />
    );
    expect(html).toContain("precio geo");
    expect(html).toContain("tus otras búsquedas");
    expect(html).toContain("/precios");
  });
  it("has an honest empty state", () => {
    expect(renderToStaticMarkup(<GscCtr items={[]} />)).toContain("Ninguna búsqueda");
  });
});

describe("GscDevices", () => {
  it("explains a mobile gap of one or more positions, singular included", () => {
    const html = renderToStaticMarkup(
      <GscDevices
        devices={[
          { device: "mobile", label: "Móvil", position: 9, ctr: 0.02, impressionShare: 0.7 },
          { device: "desktop", label: "Ordenador", position: 8, ctr: 0.04, impressionShare: 0.3 }
        ]}
      />
    );
    expect(html).toContain("Móvil");
    expect(html).toContain("1,0 puesto más abajo");
  });
});

describe("GscPosition", () => {
  it("shows the average position, its change and the tier shares", () => {
    const tiers = TIERS.map((t, i) => ({ key: t.key, label: t.label, range: t.range, count: [1, 2, 1, 0][i], share: [0.25, 0.5, 0.25, 0][i] }));
    const html = renderToStaticMarkup(<GscPosition position={{ value: 9.6, delta: 1.3 }} tiers={tiers} daily={[]} />);
    expect(html).toContain("9,6");
    expect(html).toContain("1,3 puestos");
    expect(html).toContain("10,9");
    expect(html).toContain("50%");
  });
  it("says there is nothing to compare without a previous period", () => {
    const html = renderToStaticMarkup(<GscPosition position={{ value: 5, delta: null }} tiers={[]} daily={[]} />);
    expect(html).toContain("Sin periodo anterior");
  });
});
