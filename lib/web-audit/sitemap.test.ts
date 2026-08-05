import { describe, expect, it } from "vitest";
import { pagesMissingFromSitemap, parseSitemap, sitemapSteps, type SitemapReport } from "./sitemap";

const urlset = (locs: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${locs.map((l) => `  <url><loc>${l}</loc><lastmod>2026-08-01</lastmod></url>`).join("\n")}
</urlset>`;

describe("parseSitemap", () => {
  it("returns null when /sitemap.xml was unreachable, leaving the old branch untouched", () => {
    expect(parseSitemap(null)).toBeNull();
  });

  it("reads a normal sitemap", () => {
    const report = parseSitemap(urlset(["https://acme.com/", "https://acme.com/precios"]))!;

    expect(report.kind).toBe("urlset");
    expect(report.locCount).toBe(2);
    expect(report.truncated).toBe(false);
    expect(report.locs).toEqual(["https://acme.com/", "https://acme.com/precios"]);
  });

  it("recognises a sitemap index WITHOUT fetching its children", () => {
    // Following those <loc>s would be link-following — a crawler, which is
    // forbidden without its own approval. "index" is the honest answer.
    const report = parseSitemap(
      `<sitemapindex><sitemap><loc>https://acme.com/sitemap-posts.xml</loc></sitemap></sitemapindex>`
    )!;

    expect(report.kind).toBe("index");
    expect(report.locCount).toBe(1);
  });

  it("catches the soft 404 the old presence-only check counted as a valid sitemap", () => {
    // A server answering /sitemap.xml with its HTML error page and a 200 is
    // the single most common real failure here, and the reachability check
    // could never see it.
    const report = parseSitemap("<!doctype html><html><body><h1>404 — no encontrado</h1></body></html>")!;

    expect(report.kind).toBe("invalid");
    expect(report.locCount).toBe(0);
  });

  it("flags truncation so a count is never presented as a total", () => {
    const many = Array.from({ length: 4000 }, (_, i) => `https://acme.com/p${i}`);
    const report = parseSitemap(urlset(many))!;

    expect(report.truncated).toBe(true);
    expect(report.locCount).toBeGreaterThan(0);
  });

  it("keeps at most MAX_LOCS_KEPT urls while still counting them all", () => {
    const many = Array.from({ length: 700 }, (_, i) => `https://acme.com/p${i}`);
    const report = parseSitemap(urlset(many))!;

    expect(report.locCount).toBe(700);
    expect(report.locs).toHaveLength(500);
  });

  it("does not let a commented-out block decide the kind or the count", () => {
    const report = parseSitemap(
      `<!-- <urlset><url><loc>https://acme.com/fantasma</loc></url></urlset> -->
       <sitemapindex><sitemap><loc>https://acme.com/s1.xml</loc></sitemap></sitemapindex>`
    )!;

    expect(report.kind).toBe("index");
    expect(report.locs).not.toContain("https://acme.com/fantasma");
  });

  it("decodes entities, and decodes & last so &amp;lt; stays literal", () => {
    const report = parseSitemap(urlset(["https://acme.com/a?x=1&amp;y=2", "https://acme.com/&amp;lt;"]))!;

    expect(report.locs[0]).toBe("https://acme.com/a?x=1&y=2");
    expect(report.locs[1]).toBe("https://acme.com/&lt;");
  });

  it("tolerates namespaced and attribute-laden tags", () => {
    const report = parseSitemap(
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc xml:lang="es">https://acme.com/es</loc></url></urlset>`
    )!;

    expect(report.locCount).toBe(1);
    expect(report.locs[0]).toBe("https://acme.com/es");
  });

  it("skips empty <loc> entries instead of counting blanks", () => {
    const report = parseSitemap(`<urlset><url><loc>  </loc></url><url><loc>https://acme.com/a</loc></url></urlset>`)!;

    expect(report.locCount).toBe(1);
  });
});

function report(overrides: Partial<SitemapReport> = {}): SitemapReport {
  return { kind: "urlset", locCount: 2, truncated: false, locs: [], ...overrides };
}

describe("pagesMissingFromSitemap", () => {
  it("lists the audited pages absent from the sitemap", () => {
    const missing = pagesMissingFromSitemap(
      report({ locs: ["https://acme.com/", "https://acme.com/precios"] }),
      ["https://acme.com/", "https://acme.com/blog/a"]
    );

    expect(missing).toEqual(["https://acme.com/blog/a"]);
  });

  it("treats www, trailing slash, scheme, query and hash as the same page", () => {
    const missing = pagesMissingFromSitemap(report({ locs: ["http://www.acme.com/precios/"] }), [
      "https://acme.com/precios?utm=x#top"
    ]);

    expect(missing).toEqual([]);
  });

  it("says 'cannot tell' for a sitemap index rather than calling everything missing", () => {
    // The pages live in child sitemaps this phase deliberately never fetches.
    expect(pagesMissingFromSitemap(report({ kind: "index" }), ["https://acme.com/a"])).toBeNull();
  });

  it("says 'cannot tell' when the file was truncated", () => {
    // A page could easily sit in the part we never read. "Estas páginas no
    // están en tu sitemap" is a claim the user acts on — it must not be a
    // guess.
    expect(pagesMissingFromSitemap(report({ truncated: true }), ["https://acme.com/a"])).toBeNull();
  });

  it("says 'cannot tell' for an invalid sitemap and for no sitemap at all", () => {
    expect(pagesMissingFromSitemap(report({ kind: "invalid" }), ["https://acme.com/a"])).toBeNull();
    expect(pagesMissingFromSitemap(null, ["https://acme.com/a"])).toBeNull();
  });

  it("never reports an unparseable audited URL as missing", () => {
    expect(pagesMissingFromSitemap(report({ locs: [] }), ["no es una url"])).toEqual([]);
  });
});

describe("sitemapSteps", () => {
  it("points at the platform switch instead of handing over a file to upload", () => {
    // A static sitemap we generated would be stale the moment the user
    // publishes, and built from the ~15 URLs we happen to know.
    const bodies = sitemapSteps("acme.com").map((s) => s.body).join(" ");

    expect(bodies).toMatch(/WordPress|Shopify|Next\.js/);
    expect(bodies).toMatch(/actualizarse solo/);
  });

  it("ends on a URL the user opens, and warns that a reachable URL is not proof", () => {
    // Reachability is exactly what the old check measured and what a soft 404
    // defeats, so the verification step has to say so.
    const steps = sitemapSteps("acme.com");
    const last = steps.at(-1)!;

    expect(last.code).toBe("https://acme.com/sitemap.xml");
    expect(last.body).toMatch(/404|error/i);
  });

  it("uses the project's real domain in the robots.txt line", () => {
    expect(sitemapSteps("otra.es").some((s) => s.code === "Sitemap: https://otra.es/sitemap.xml")).toBe(true);
  });
});

describe("compatibilidad con snapshots antiguos", () => {
  it("distingue 'campo ausente' de 'sitemap no encontrado'", () => {
    // `BotAccessReport.sitemap` es opcional: undefined = auditoría anterior a
    // esta fase, que nunca midió esto; null = medida y no alcanzable. Si el
    // tipo los colapsara, la UI presentaría como hecho ("no es un sitemap") un
    // dato que aquella auditoría jamás tomó — inventar una medición
    // retroactiva es exactamente lo que este proyecto prohíbe.
    const antiguo: { sitemap?: SitemapReport | null } = {};
    const medido: { sitemap?: SitemapReport | null } = { sitemap: null };

    expect(antiguo.sitemap).toBeUndefined();
    expect(medido.sitemap).toBeNull();
    expect(antiguo.sitemap === medido.sitemap).toBe(false);
  });

  it("un 404 blando deja de contar como sitemap válido", () => {
    // La comprobación vieja sólo miraba si la URL respondía, así que un
    // servidor que devuelve su página de error con 200 pasaba como
    // "Encontrado". Es el fallo más común y el que motivó parsear.
    const soft404 = parseSitemap("<html><body>Página no encontrada</body></html>")!;

    expect(soft404.kind).toBe("invalid");
  });
});

describe("un probe no resuelto no es una incidencia", () => {
  it("distingue los tres estados en vez de colapsarlos en un booleano", async () => {
    // El fallo real (2026-08-04, mozilla.org): 404, 403, timeout y error de
    // red devolvían todos null, y los cuatro salían como "No encontrado". Era
    // tolerable mientras sólo informábamos; dejó de serlo al añadir pasos de
    // arreglo, porque a un cliente detrás de un WAF le diríamos que cree un
    // fichero que ya tiene.
    const { buildTechnicalIssuesReport } = await import("./issues");
    const base = { robotsFound: true, bots: [], llmsTxtFound: false, llmsTxtBytes: null, sitemapFound: false };

    const bloqueado = buildTechnicalIssuesReport([], {
      ...base,
      probes: { robots: "found", llmsTxt: "unknown", sitemap: "unknown" }
    });
    const ausente = buildTechnicalIssuesReport([], {
      ...base,
      probes: { robots: "found", llmsTxt: "absent", sitemap: "absent" }
    });

    const claves = (r: { issues: Array<{ check: string }> }) => r.issues.map((i) => i.check);

    // Sin comprobar → ni incidencia ni "correcto": simplemente no medido.
    expect(claves(bloqueado)).not.toContain("sitemap_missing");
    expect(claves(bloqueado)).not.toContain("llms_txt_missing");
    expect(bloqueado.passing.map((p) => p.check)).not.toContain("sitemap_missing");

    // Ausente de verdad → incidencia, como siempre.
    expect(claves(ausente)).toContain("sitemap_missing");
    expect(claves(ausente)).toContain("llms_txt_missing");
  });

  it("un snapshot sin `probes` conserva su lectura de antes", async () => {
    // Sin el campo, false seguía significando "no encontrado". Reinterpretarlo
    // como "sin comprobar" sería reescribir hacia atrás lo que aquella
    // auditoría afirmó.
    const { buildTechnicalIssuesReport } = await import("./issues");
    const antiguo = buildTechnicalIssuesReport([], {
      robotsFound: true,
      bots: [],
      llmsTxtFound: false,
      llmsTxtBytes: null,
      sitemapFound: false
    });

    expect(antiguo.issues.map((i) => i.check)).toContain("sitemap_missing");
  });
});
