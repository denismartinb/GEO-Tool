import { describe, expect, it } from "vitest";

import { resolveBotAccess, resolveGooglebotAccess } from "@/lib/web-audit/robots";
import { ROBOTS_TRAINING_OFF_SEARCH_ON } from "./robots-ai-snippet";

/**
 * El artículo de bots de IA promete que este robots.txt cierra el
 * entrenamiento y deja abierta la búsqueda. Se comprueba con el mismo lector
 * que usa la Auditoría técnica, para que lo que dice la pieza y lo que
 * marcará el producto sobre la web del lector no se contradigan.
 */
describe("robots.txt de ejemplo del artículo de bots de IA", () => {
  const access = resolveBotAccess(ROBOTS_TRAINING_OFF_SEARCH_ON);

  it("bloquea a los bots de entrenamiento", () => {
    expect(access.get("GPTBot")).toBe(false);
    expect(access.get("ClaudeBot")).toBe(false);
    expect(access.get("Google-Extended")).toBe(false);
  });

  it("deja entrar a los bots de búsqueda con IA", () => {
    expect(access.get("OAI-SearchBot")).toBe(true);
    expect(access.get("PerplexityBot")).toBe(true);
  });

  it("no toca a Google ni a Bing", () => {
    expect(resolveGooglebotAccess(ROBOTS_TRAINING_OFF_SEARCH_ON)).toBe(true);
    expect(access.get("Bingbot")).toBe(true);
  });
});
