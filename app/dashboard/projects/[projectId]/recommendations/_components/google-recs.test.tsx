import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/search-console/load", () => ({ loadSearchConsoleScreen: vi.fn() }));
vi.mock("@/lib/search-console/screen-inputs", () => ({ readSearchConsoleInputs: vi.fn() }));
vi.mock("@/lib/search-console/rec-states", () => ({ readRecStates: vi.fn() }));
vi.mock("@/app/dashboard/projects/[projectId]/actions", () => ({
  addPrompts: vi.fn(),
  markGoogleRecommendationAction: vi.fn(),
  undoGoogleRecommendationAction: vi.fn()
}));

import type { GoogleRecommendation } from "@/lib/search-console/recommendations";
import { GooglePlanCard } from "./google-plan-card";
import { GoogleLaterCard } from "./google-recs";
import { pickPlanRec, planCopy } from "./google-rec-copy";

const push: GoogleRecommendation = {
  kind: "push_page_one",
  query: "aparecer en chatgpt",
  position: 12.4,
  impressions: 12210,
  page: "https://ex.com/blog/aparecer",
  linkFrom: ["https://ex.com/", "https://ex.com/blog/que-es-geo"]
};
const snippet: GoogleRecommendation = {
  kind: "improve_snippet",
  query: "precio herramienta geo",
  position: 3.2,
  impressions: 11240,
  ctr: 0.008,
  benchmark: 0.1,
  page: "https://ex.com/precios"
};
const watch: GoogleRecommendation = { kind: "watch_in_ai", query: "cuál es la mejor herramienta geo", position: 9.1, impressions: 300 };

const later = (rec: GoogleRecommendation, canPersist = false) =>
  renderToStaticMarkup(<GoogleLaterCard rec={rec} projectId="p1" canPersist={canPersist} />);

describe("pickPlanRec — qué tarjeta de Google entra en el plan (log §307)", () => {
  it("la página 1 primero, luego el título, nunca «vigilar»", () => {
    expect(pickPlanRec([watch, snippet, push])).toBe(push);
    expect(pickPlanRec([watch, snippet])).toBe(snippet);
    expect(pickPlanRec([watch])).toBeNull();
    expect(pickPlanRec([])).toBeNull();
  });
});

describe("GooglePlanCard — la tarjeta de Google dentro del plan", () => {
  const card = (rec: GoogleRecommendation, canPersist = true) =>
    renderToStaticMarkup(
      <GooglePlanCard rec={rec as Parameters<typeof GooglePlanCard>[0]["rec"]} projectId="p1" rank={2} canPersist={canPersist} />
    );

  it("lleva su etiqueta, su número y su puesto en Google, nunca puntos GEO", () => {
    const html = card(push);
    expect(html).toContain('class="rec2-rank">2<');
    expect(html).toContain("rec2-src rec2-src-g");
    expect(html).toContain("Subir a la página 1");
    expect(html).toContain("Lleva «aparecer en chatgpt» a la primera página de Google");
    expect(html).toContain("12º");
    expect(html).toContain("Puesto en Google");
    expect(html).not.toContain(" pt<");
    expect(html).toContain("1 búsqueda · 12.210 impresiones en 28 días");
  });

  it("el detalle dice lo que vio Google, por qué funciona y cómo hacerlo", () => {
    const html = card(push);
    expect(html).toContain("Dato de Google");
    expect(html).toContain("Lo controlas tú");
    expect(html).toContain("La búsqueda");
    expect(html).toContain("Puesto 12 · /blog/aparecer");
    expect(html).toContain("Abre tu Home y añade un enlace a /blog/aparecer con el texto «aparecer en chatgpt».");
    expect(html).toContain("Se quita sola cuando Google te suba a la página 1.");
  });

  it("«Marcar como hecho» y «Ahora no» sólo si se puede guardar (log §294)", () => {
    expect(card(push, true)).toContain("Marcar como hecho");
    expect(card(push, true)).toContain("Ahora no");
    expect(card(push, false)).not.toContain("Marcar como hecho");
    expect(card(push, false)).not.toContain("Ahora no");
  });

  it("el título compara con las búsquedas de la propia web, nunca con una curva del sector", () => {
    const html = card(snippet);
    expect(html).toContain("Mejora el título de /precios: la ven 11.240 veces y entra el 0,8%");
    expect(html).toContain("Tus otras búsquedas en los puestos 4 a 10 entran alrededor del 10,0%");
    expect(planCopy(snippet as Parameters<typeof planCopy>[0]).metricLabel).toBe("Entran en Google");
  });
});

describe("GoogleLaterCard — la fila «Con tus datos de Google»", () => {
  it("la tarjeta de título nombra la búsqueda y su puesto", () => {
    const html = later(snippet, true);
    expect(html).toContain("Título y descripción");
    expect(html).toContain("«precio herramienta geo»: puesto 3 y pocos clics");
    expect(html).toContain("Marcar como hecho");
    expect(html).toContain('class="grec-quiet"');
  });

  it("ofrece vigilar en la IA una pregunta de Google", () => {
    const html = later(watch, true);
    expect(html).toContain("Vigilar en la IA");
    expect(html).toContain("«cuál es la mejor herramienta geo»");
    expect(html).toContain("Vigilar prompt");
    expect(html).toContain("Ahora no");
  });

  it("sin la migración no hay botones de estado (log §294)", () => {
    expect(later(snippet, false)).not.toContain("Marcar como hecho");
    expect(later(watch, false)).not.toContain("Ahora no");
  });

  it("si la página 1 acaba en la fila, dice desde dónde enlazar", () => {
    const html = later(push);
    expect(html).toContain("«aparecer en chatgpt»: puesto 12");
    expect(html).toContain("Enlaza /blog/aparecer desde tu Home y /blog/que-es-geo");
  });
});
