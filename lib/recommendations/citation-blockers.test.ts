import { describe, expect, it } from "vitest";

import { blockerDetail, blockerStrip, blockerTitle, blockerUrls, engineAccessChanges, findCitationBlockers } from "./citation-blockers";
import type { PageAuditEntry } from "@/lib/web-audit/technical-audit";
import type { BotAccessReport } from "@/lib/web-audit/robots";

const bots = (blocked: string[] = []): BotAccessReport =>
  ({
    robotsFound: true,
    bots: [
      ...blocked.map((agent) => ({ agent, allowed: false })),
      { agent: "Bingbot", allowed: true }
    ],
    llmsTxtFound: true,
    llmsTxtBytes: 100,
    sitemapFound: true
  }) as BotAccessReport;

const page = (url: string, indexability: Record<string, unknown> | undefined): PageAuditEntry =>
  ({
    url,
    contextLabel: "portada",
    status: "analyzed",
    check: indexability === undefined ? ({} as never) : ({ indexability } as never),
    fetchMs: 100,
    htmlBytes: 5000
  }) as PageAuditEntry;

describe("findCitationBlockers", () => {
  it("no encuentra nada cuando no hay bloqueos", () => {
    expect(findCitationBlockers({ bots: bots(), pages: [page("https://acme.com/", { noindex: false, snippetBlocks: [] })] })).toEqual([]);
  });

  it("saca los motores que no pueden leer la web, por su nombre (log §426)", () => {
    expect(findCitationBlockers({ bots: bots(["GPTBot", "OAI-SearchBot", "PerplexityBot"]), pages: [] })).toEqual([
      { kind: "bots", agents: ["ChatGPT", "Perplexity"] }
    ]);
  });

  it("un bot de entrenamiento cerrado no impide la cita", () => {
    expect(findCitationBlockers({ bots: bots(["GPTBot", "ClaudeBot"]), pages: [] })).toEqual([]);
  });

  it("saca noindex con la URL concreta — lo que ninguna recomendación decía antes", () => {
    const pages = [page("https://acme.com/precios", { noindex: true }), page("https://acme.com/", { noindex: false })];
    expect(findCitationBlockers({ bots: bots(), pages })).toEqual([
      { kind: "noindex", urls: ["https://acme.com/precios"] }
    ]);
  });

  it("saca nosnippet con su URL", () => {
    const pages = [page("https://acme.com/a", { snippetBlocks: [{ directive: "nosnippet", source: "header" }] })];
    expect(findCitationBlockers({ bots: bots(), pages })).toEqual([{ kind: "snippet", urls: ["https://acme.com/a"] }]);
  });

  it("acumula los tres, en orden de lectura", () => {
    const pages = [
      page("https://acme.com/a", { noindex: true }),
      page("https://acme.com/b", { snippetBlocks: [{ directive: "max-snippet:0", source: "meta" }] })
    ];
    const found = findCitationBlockers({ bots: bots(["OAI-SearchBot"]), pages });
    expect(found.map((b) => b.kind)).toEqual(["bots", "noindex", "snippet"]);
  });

  it("una instantánea anterior a la fase NO se declara limpia: se excluye", () => {
    // `indexability` ausente = nunca medido. Este módulo sólo afirma
    // problemas, así que la ausencia nunca se convierte en un «todo bien».
    expect(findCitationBlockers({ bots: bots(), pages: [page("https://acme.com/", undefined)] })).toEqual([]);
  });

  it("ignora páginas que no se pudieron analizar", () => {
    const skipped = { url: "https://acme.com/x", contextLabel: "citada", status: "skipped_timeout", check: null } as unknown as PageAuditEntry;
    expect(findCitationBlockers({ bots: bots(), pages: [skipped] })).toEqual([]);
  });

  it("tolera una instantánea inexistente", () => {
    expect(findCitationBlockers({ bots: null, pages: null })).toEqual([]);
  });
});

describe("copy del bloqueo", () => {
  it("nombra el cambio y dónde, en singular y plural (RECS-HEADLINES-1, log §354)", () => {
    expect(blockerTitle({ kind: "noindex", urls: ["https://acme.com/ofertas"] })).toBe("Quita la etiqueta noindex de /ofertas");
    expect(blockerTitle({ kind: "noindex", urls: ["a", "b"] })).toBe("Quita la etiqueta noindex de 2 páginas");
    expect(blockerTitle({ kind: "snippet", urls: ["https://acme.com/precios"] })).toBe("Quita nosnippet de /precios");
    expect(blockerTitle({ kind: "snippet", urls: ["https://acme.com/una/ruta/demasiado/larga/aqui"] })).toBe(
      "Quita nosnippet de una de tus páginas"
    );
  });

  it("dice qué fichero tocar para los bots", () => {
    expect(blockerTitle({ kind: "bots", agents: ["ChatGPT", "Perplexity"] })).toBe("Abre tu robots.txt a ChatGPT y Perplexity");
    expect(blockerTitle({ kind: "bots", agents: ["ChatGPT", "Gemini", "Claude", "Perplexity"] })).toBe(
      "Abre tu robots.txt a ChatGPT, Gemini y 2 más"
    );
  });

  it("cada bloqueo explica por qué impide la cita", () => {
    expect(blockerDetail({ kind: "snippet", urls: ["a"] })).toContain("sin fragmento no hay cita");
    expect(blockerDetail({ kind: "noindex", urls: ["a"] })).toContain("ningún motor la va a citar");
    expect(blockerDetail({ kind: "noindex", urls: ["a"] })).toMatch(/^Lleva /);
    expect(blockerDetail({ kind: "noindex", urls: ["a", "b"] })).toContain("ningún motor las va a citar");
    expect(blockerDetail({ kind: "snippet", urls: ["a"] })).toMatch(/^Lleva /);
    expect(blockerDetail({ kind: "snippet", urls: ["a", "b"] })).toMatch(/^Llevan /);
  });

  it("sólo los bloqueos por página traen URLs", () => {
    expect(blockerUrls({ kind: "bots", agents: ["ChatGPT"] })).toEqual([]);
    expect(blockerUrls({ kind: "noindex", urls: ["https://acme.com/a"] })).toEqual(["https://acme.com/a"]);
  });
});

describe("server blocker (GEO-ALERTS-1, log §440)", () => {
  const probe = (engines: Record<string, "allowed" | "blocked">) => ({
    measuredAt: "2026-11-02T00:00:00Z",
    baseline: "ok" as const,
    engines: Object.fromEntries(Object.entries(engines).map(([e, state]) => [e, { token: "x", state, status: 200 }]))
  });
  const withProbe = (blocked: string[], engines: Record<string, "allowed" | "blocked">) =>
    ({ ...bots(blocked), serverProbe: probe(engines) }) as BotAccessReport;

  it("goes first, and never repeats an engine robots.txt already closes", () => {
    const found = findCitationBlockers({ bots: withProbe(["PerplexityBot"], { chatgpt: "blocked", perplexity: "blocked" }), pages: [] });
    expect(found).toEqual([
      { kind: "server", agents: ["ChatGPT"] },
      { kind: "bots", agents: ["Perplexity"] }
    ]);
  });

  it("titles the action for Recomendaciones and the state for Visión general", () => {
    const b = { kind: "server" as const, agents: ["ChatGPT"] };
    expect(blockerTitle(b)).toBe("Deja pasar a ChatGPT en tu servidor");
    expect(blockerStrip(b)).toMatchObject({ title: "ChatGPT no puede entrar en tu web", evidence: "Simulación" });
    expect(blockerStrip({ kind: "bots", agents: ["Perplexity", "Claude"] })).toMatchObject({
      title: "Perplexity y Claude no pueden leer tu web",
      evidence: "Comprobado"
    });
    expect(blockerUrls(b)).toEqual([]);
  });
});

describe("engineAccessChanges (GEO-ALERTS-1, log §440)", () => {
  const open = { tokens: { "OAI-SearchBot": true, "ChatGPT-User": true, PerplexityBot: true, "Perplexity-User": true }, starRules: [] };
  const closed = { tokens: { ...open.tokens, PerplexityBot: false }, starRules: [] };
  const report = (aiBots: typeof open, server?: Record<string, "allowed" | "blocked" | "unknown">) =>
    ({
      ...bots(),
      aiBots,
      ...(server
        ? {
            serverProbe: {
              measuredAt: "x",
              baseline: "ok",
              engines: Object.fromEntries(Object.entries(server).map(([e, state]) => [e, { token: "x", state, status: 200 }]))
            }
          }
        : {})
    }) as BotAccessReport;

  it("sees a robots.txt block and its fix", () => {
    expect(engineAccessChanges(report(open), report(closed)).blocked).toEqual([{ name: "Perplexity", by: "robots" }]);
    expect(engineAccessChanges(report(closed), report(open)).resolved).toEqual(["Perplexity"]);
  });

  it("sees a server block only between two measured probes", () => {
    expect(engineAccessChanges(report(open, { chatgpt: "allowed" }), report(open, { chatgpt: "blocked" })).blocked).toEqual([
      { name: "ChatGPT", by: "server" }
    ]);
    // First probe ever (old snapshot): a discovery, not a change.
    expect(engineAccessChanges(report(open), report(open, { chatgpt: "blocked" })).blocked).toEqual([]);
    // A probe we could not run never resolves anything.
    expect(engineAccessChanges(report(open, { chatgpt: "blocked" }), report(open, { chatgpt: "unknown" })).resolved).toEqual([]);
    expect(engineAccessChanges(report(open, { chatgpt: "blocked" }), report(open, { chatgpt: "allowed" })).resolved).toEqual(["ChatGPT"]);
  });

  it("is empty without both sides", () => {
    expect(engineAccessChanges(null, report(closed))).toEqual({ blocked: [], resolved: [] });
  });
});
