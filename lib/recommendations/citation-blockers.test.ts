import { describe, expect, it } from "vitest";

import { blockerDetail, blockerTitle, blockerUrls, findCitationBlockers } from "./citation-blockers";
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

  it("saca los bots bloqueados, como ya hacía la pantalla", () => {
    expect(findCitationBlockers({ bots: bots(["GPTBot", "OAI-SearchBot"]), pages: [] })).toEqual([
      { kind: "bots", agents: ["GPTBot", "OAI-SearchBot"] }
    ]);
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
    const found = findCitationBlockers({ bots: bots(["GPTBot"]), pages });
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
  it("concuerda en singular y plural", () => {
    expect(blockerTitle({ kind: "noindex", urls: ["a"] })).toBe("Una de tus páginas no se puede indexar");
    expect(blockerTitle({ kind: "noindex", urls: ["a", "b"] })).toBe("2 de tus páginas no se pueden indexar");
    expect(blockerTitle({ kind: "snippet", urls: ["a"] })).toBe("Una de tus páginas prohíbe mostrar fragmentos");
  });

  it("resume los bots como antes, sin cambiar el copy que ya existía", () => {
    expect(blockerTitle({ kind: "bots", agents: ["GPTBot", "OAI-SearchBot", "ClaudeBot", "PerplexityBot"] })).toBe(
      "Tu web bloquea a GPTBot y OAI-SearchBot y 2 más"
    );
  });

  it("cada bloqueo explica por qué impide la cita", () => {
    expect(blockerDetail({ kind: "snippet", urls: ["a"] })).toContain("sin fragmento no hay cita");
    expect(blockerDetail({ kind: "noindex", urls: ["a"] })).toContain("ningún motor la va a citar");
  });

  it("sólo los bloqueos por página traen URLs", () => {
    expect(blockerUrls({ kind: "bots", agents: ["GPTBot"] })).toEqual([]);
    expect(blockerUrls({ kind: "noindex", urls: ["https://acme.com/a"] })).toEqual(["https://acme.com/a"]);
  });
});
