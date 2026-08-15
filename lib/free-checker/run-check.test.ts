import { describe, expect, it, vi } from "vitest";
import { PUBLIC_CHECK_ENGINE, type PublicCheckDeps, runPublicCheck } from "./run-check";

/**
 * FREE-CHECKER-1 Fase B2.
 *
 * Lo que estos tests protegen es que la comprobación siga siendo REAL: que la
 * mención la decida la verificación contra el texto y no el modelo, que la
 * llamada sea ciega a la marca, y que ningún fallo produzca un resultado en
 * vez de un error. Un comprobador que devuelve algo plausible cuando la IA no
 * respondió es exactamente el "fake scan" que la constitución prohíbe.
 */

const PROFILE = {
  whatItSells: "diseño de producto",
  sector: "servicios",
  subSector: "agencia",
  businessModel: "b2b" as const,
  targetCustomer: "startups",
  geographicScope: "España",
  sizeEstimate: "pequeña",
  confidence: "high" as const
};

function deps(overrides: Partial<PublicCheckDeps> = {}): PublicCheckDeps {
  return {
    resolveBusinessContext: async () => ({ status: "identified", profile: PROFILE }),
    suggestPrompts: async () => [{ text: "¿Qué agencias de diseño recomiendas en Madrid?" }],
    generateAnswer: async () => ({ text: "Te recomiendo Estudio Norte y Cuarto Piso." }),
    extract: async () => ({
      data: {
        brand: { mentioned: false, position: null },
        citations: [],
        other_brands_mentioned: ["Estudio Norte", "Cuarto Piso"]
      }
    }),
    verify: (data) => data,
    ...overrides
  };
}

describe("runPublicCheck", () => {
  it("devuelve la pregunta y la respuesta literales, que es la prueba de que es real", async () => {
    const result = await runPublicCheck("tallerdeideas.es", deps());
    expect(result.status).toBe("completed");
    if (result.status !== "completed") return;
    expect(result.prompt).toBe("¿Qué agencias de diseño recomiendas en Madrid?");
    expect(result.answer).toBe("Te recomiendo Estudio Norte y Cuarto Piso.");
    expect(result.engine).toBe(PUBLIC_CHECK_ENGINE);
  });

  it("devuelve quién apareció en su lugar", async () => {
    const result = await runPublicCheck("tallerdeideas.es", deps());
    if (result.status !== "completed") throw new Error("esperaba completed");
    expect(result.brandMentioned).toBe(false);
    expect(result.otherBrands).toEqual(["Estudio Norte", "Cuarto Piso"]);
  });

  it("la mención la decide la VERIFICACIÓN, no lo que afirme el modelo", async () => {
    // El modelo dice que sí mencionó la marca; la verificación contra el texto
    // dice que no. Gana la verificación. Sin esto, una alucinación de
    // relevancia temática se publicaría como una mención real.
    const verify = vi.fn((data) => ({ ...data, brand: { mentioned: false, position: null } }));
    const result = await runPublicCheck(
      "tallerdeideas.es",
      deps({
        extract: async () => ({
          data: {
            brand: { mentioned: true, position: 1 },
            citations: [],
            other_brands_mentioned: []
          }
        }),
        verify
      })
    );
    if (result.status !== "completed") throw new Error("esperaba completed");
    expect(verify).toHaveBeenCalledWith(expect.anything(), "Te recomiendo Estudio Norte y Cuarto Piso.", "Tallerdeideas");
    expect(result.brandMentioned).toBe(false);
    expect(result.brandPosition).toBeNull();
  });

  it("la marca deducida del dominio es una APROXIMACIÓN, y por eso hay que poder corregirla", async () => {
    // `tallerdeideas.es` -> "Tallerdeideas", que no es como se escribe la
    // marca ("Taller de Ideas"): el dominio no lleva separadores por los que
    // partir. Buscar el nombre equivocado convierte una mención real en una
    // ausencia — el caso Mozilla/Firefox una vuelta más abajo, porque aquí ni
    // siquiera hay un humano que haya escrito su marca.
    //
    // Este test no describe un fallo a arreglar aquí: describe por qué la
    // pantalla TIENE que dejar corregir la marca antes de dar un veredicto,
    // y por qué el copy no puede decir "no apareces" sino "no apareció
    // <marca>".
    const seen: string[] = [];
    const capture: PublicCheckDeps["verify"] = (data, _raw, brand) => {
      seen.push(brand);
      return data;
    };
    await runPublicCheck("tallerdeideas.es", deps({ verify: capture }));
    await runPublicCheck("taller-de-ideas.es", deps({ verify: capture }));
    expect(seen).toEqual(["Tallerdeideas", "Taller De Ideas"]);
  });

  it("no publica una posición cuando no hubo mención", async () => {
    // Una posición sin mención es un dato sin sujeto: se lee como "sales el
    // tercero" cuando en realidad no sales.
    const result = await runPublicCheck(
      "tallerdeideas.es",
      deps({
        extract: async () => ({
          data: { brand: { mentioned: false, position: 3 }, citations: [], other_brands_mentioned: [] }
        })
      })
    );
    if (result.status !== "completed") throw new Error("esperaba completed");
    expect(result.brandPosition).toBeNull();
  });

  it("la generación es CIEGA A LA MARCA (ADR 0007)", async () => {
    // Si el motor supiera a quién medimos, podría complacernos nombrándolo y
    // la comprobación mediría nuestra pregunta, no el mercado.
    const generateAnswer: PublicCheckDeps["generateAnswer"] = vi.fn(async () => ({
      text: "una respuesta"
    }));
    await runPublicCheck("tallerdeideas.es", deps({ generateAnswer }));
    const arg = JSON.stringify(vi.mocked(generateAnswer).mock.calls[0]?.[0] ?? {});
    expect(arg.toLowerCase()).not.toContain("taller");
  });

  it("no rastrea competidores: la lista va vacía a propósito", async () => {
    // Es lo que hace que todo lo que nombre la IA salga por
    // `other_brands_mentioned`, o sea "quién apareció en tu lugar".
    const extract: PublicCheckDeps["extract"] = vi.fn(async () => ({
      data: { brand: { mentioned: false, position: null }, citations: [], other_brands_mentioned: [] }
    }));
    await runPublicCheck("tallerdeideas.es", deps({ extract }));
    expect(vi.mocked(extract).mock.calls[0]?.[0].competitors).toEqual([]);
  });

  it("detecta una cita del propio dominio, incluida en subdominio", async () => {
    const result = await runPublicCheck(
      "tallerdeideas.es",
      deps({
        extract: async () => ({
          data: {
            brand: { mentioned: true, position: 1 },
            citations: [{ domain: "blog.tallerdeideas.es" }, { domain: "otra.com" }],
            other_brands_mentioned: []
          }
        })
      })
    );
    if (result.status !== "completed") throw new Error("esperaba completed");
    expect(result.citedOwnDomain).toBe(true);
    expect(result.citedDomains).toEqual(["blog.tallerdeideas.es", "otra.com"]);
  });

  it("una web ilegible es un error declarado, no una comprobación a medias", async () => {
    const unreachable = await runPublicCheck(
      "tallerdeideas.es",
      deps({ resolveBusinessContext: async () => ({ status: "unidentified" }) })
    );
    expect(unreachable).toEqual({ status: "failed", error: "site_unreachable" });

    const threw = await runPublicCheck(
      "tallerdeideas.es",
      deps({
        resolveBusinessContext: async () => {
          throw new Error("ECONNREFUSED");
        }
      })
    );
    expect(threw).toEqual({ status: "failed", error: "site_unreachable" });
  });

  it("un motor caído es un error, NUNCA una respuesta inventada", async () => {
    const empty = await runPublicCheck(
      "tallerdeideas.es",
      deps({ generateAnswer: async () => ({ text: "   " }) })
    );
    expect(empty).toEqual({ status: "failed", error: "engine_unavailable" });

    const threw = await runPublicCheck(
      "tallerdeideas.es",
      deps({
        generateAnswer: async () => {
          throw new Error("429 quota");
        }
      })
    );
    expect(threw).toEqual({ status: "failed", error: "engine_unavailable" });
  });

  it("sin pregunta derivada no se llega a gastar en la generación", async () => {
    const generateAnswer = vi.fn(async () => ({ text: "no debería llamarse" }));
    const result = await runPublicCheck(
      "tallerdeideas.es",
      deps({ suggestPrompts: async () => [], generateAnswer })
    );
    expect(result).toEqual({ status: "failed", error: "engine_unavailable" });
    expect(generateAnswer).not.toHaveBeenCalled();
  });

  it("un fallo de extracción no se disfraza de no-mención", async () => {
    // Devolver `brandMentioned: false` aquí sería decirle al visitante que no
    // aparece cuando lo cierto es que no lo sabemos.
    const result = await runPublicCheck(
      "tallerdeideas.es",
      deps({
        extract: async () => {
          throw new Error("json roto");
        }
      })
    );
    expect(result).toEqual({ status: "failed", error: "extraction_failed" });
  });

  it("los errores son categorías de este repositorio, no mensajes del proveedor", async () => {
    // Los lee un desconocido: un mensaje crudo puede filtrar endpoints o cuotas.
    const result = await runPublicCheck(
      "tallerdeideas.es",
      deps({
        generateAnswer: async () => {
          throw new Error("https://generativelanguage.googleapis.com quota exceeded for key AIza…");
        }
      })
    );
    if (result.status !== "failed") throw new Error("esperaba failed");
    expect(result.error).toBe("engine_unavailable");
    expect(JSON.stringify(result)).not.toMatch(/googleapis|AIza|quota/i);
  });
});
