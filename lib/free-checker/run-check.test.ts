import { describe, expect, it, vi } from "vitest";
import { ExtractionError } from "@/lib/llm/extraction-errors";
import {
  PUBLIC_CHECK_ENGINE,
  PUBLIC_CHECK_STEP_BUDGET_MS,
  type PublicCheckDeps,
  describeCause,
  runPublicCheck
} from "./run-check";

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
    expect(unreachable).toMatchObject({ status: "failed", error: "site_unreachable" });

    const threw = await runPublicCheck(
      "tallerdeideas.es",
      deps({
        resolveBusinessContext: async () => {
          throw new Error("ECONNREFUSED");
        }
      })
    );
    expect(threw).toMatchObject({ status: "failed", error: "site_unreachable" });
  });

  it("un motor caído es un error, NUNCA una respuesta inventada", async () => {
    const empty = await runPublicCheck(
      "tallerdeideas.es",
      deps({ generateAnswer: async () => ({ text: "   " }) })
    );
    expect(empty).toMatchObject({ status: "failed", error: "engine_unavailable" });

    const threw = await runPublicCheck(
      "tallerdeideas.es",
      deps({
        generateAnswer: async () => {
          throw new Error("429 quota");
        }
      })
    );
    expect(threw).toMatchObject({ status: "failed", error: "engine_unavailable" });
  });

  it("sin pregunta derivada no se llega a gastar en la generación", async () => {
    const generateAnswer = vi.fn(async () => ({ text: "no debería llamarse" }));
    const result = await runPublicCheck(
      "tallerdeideas.es",
      deps({ suggestPrompts: async () => [], generateAnswer })
    );
    expect(result).toMatchObject({ status: "failed", error: "engine_unavailable" });
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
    expect(result).toMatchObject({ status: "failed", error: "extraction_failed" });
  });

  describe("presupuesto de la invocación", () => {
    // Cuatro llamadas de hasta 20 s dentro de una función con maxDuration=60.
    // Sin esto, la comprobación lenta no devuelve un error: la mata Vercel con
    // un 504 sin cuerpo, con el dinero ya gastado.

    it("no empieza NADA si no cabe el primer paso", async () => {
      const resolveBusinessContext = vi.fn(async () => ({ status: "identified", profile: PROFILE }));
      const result = await runPublicCheck(
        "tallerdeideas.es",
        deps({ resolveBusinessContext, now: () => 1_000 }),
        { deadlineAt: 1_000 + PUBLIC_CHECK_STEP_BUDGET_MS - 1 }
      );
      expect(result).toMatchObject({ status: "failed", error: "budget_exhausted" });
      expect(resolveBusinessContext).not.toHaveBeenCalled();
    });

    it("pregunta ANTES de cada paso si cabe entero, no después si ya se pasó", async () => {
      // El reloj avanza 15 s por consulta: los dos primeros pasos caben, el
      // tercero (la generación) ya no. Sin la guarda previa arrancaría igual y
      // se comería 20 s que no tiene — el fallo de ADR 0037.
      let clock = 0;
      const now = () => {
        clock += 15_000;
        return clock;
      };
      const generateAnswer = vi.fn(async () => ({ text: "no debería llegar aquí" }));
      const result = await runPublicCheck(
        "tallerdeideas.es",
        deps({ now, generateAnswer }),
        { deadlineAt: 50_000 }
      );
      expect(result).toMatchObject({ status: "failed", error: "budget_exhausted" });
      expect(generateAnswer).not.toHaveBeenCalled();
    });

    it("sin deadline no se limita nada: el presupuesto es opt-in de quien llama", async () => {
      // Los tests y cualquier llamada fuera de una función serverless no tienen
      // por qué inventarse un límite.
      const result = await runPublicCheck("tallerdeideas.es", deps());
      expect(result.status).toBe("completed");
    });

    it("deja margen real bajo maxDuration=60", () => {
      // 21 s por paso contra 20 s de timeout de Gemini: un segundo de holgura
      // para que la guarda no apruebe un paso que va a morir justo en el borde.
      expect(PUBLIC_CHECK_STEP_BUDGET_MS).toBeGreaterThan(20_000);
      expect(PUBLIC_CHECK_STEP_BUDGET_MS).toBeLessThan(60_000);
    });
  });

  describe("la causa del fallo llega al operador (2026-08-15)", () => {
    // La primera ejecución real contra producción devolvió `extraction_failed`
    // y no había forma de saber si era un 400, un JSON roto, un timeout o un
    // fallo de esquema — cuatro causas con cuatro arreglos distintos. Los cinco
    // `catch {}` que tiraban la causa eran el fallo, no el mensaje.

    it("guarda la CATEGORÍA de un ExtractionError, que es lo que distingue un 400 de un JSON roto", async () => {
      const result = await runPublicCheck(
        "tallerdeideas.es",
        deps({
          extract: async () => {
            throw new ExtractionError("schema", "OpenAI extraction JSON failed schema validation.");
          }
        })
      );
      expect(result).toMatchObject({
        status: "failed",
        error: "extraction_failed",
        detail: "schema"
      });
    });

    it("cada paso deja su propia causa, no un 'falló algo' común", async () => {
      const unreachable = await runPublicCheck(
        "tallerdeideas.es",
        deps({
          resolveBusinessContext: async () => {
            throw new TypeError("fetch failed");
          }
        })
      );
      expect(unreachable).toMatchObject({ error: "site_unreachable", detail: "TypeError" });

      const noPrompt = await runPublicCheck("tallerdeideas.es", deps({ suggestPrompts: async () => [] }));
      expect(noPrompt).toMatchObject({ error: "engine_unavailable", detail: "no_prompt" });

      const emptyAnswer = await runPublicCheck(
        "tallerdeideas.es",
        deps({ generateAnswer: async () => ({ text: "  " }) })
      );
      expect(emptyAnswer).toMatchObject({ error: "engine_unavailable", detail: "empty_answer" });
    });

    it("la causa se sanea a letras: nunca puede arrastrar un mensaje del proveedor", () => {
      expect(describeCause(new Error("https://api.openai.com 429 key sk-abc123"))).toBe("Error");
      expect(describeCause("una cadena suelta")).toBe("unknown");
      expect(describeCause(new ExtractionError("quota", "OpenAI API quota reached."))).toBe("quota");
    });
  });

  describe("motor de reserva para la extracción", () => {
    // Leer la respuesta es un paso interno que el visitante nunca ve. Tirar una
    // llamada con búsqueda ya pagada porque el lector falló era perder el
    // resultado entero teniéndolo delante.

    it("una extracción caída no tira la respuesta: la lee el motor de reserva", async () => {
      const extractFallback = vi.fn(async () => ({
        data: {
          brand: { mentioned: false, position: null },
          citations: [],
          other_brands_mentioned: ["Estudio Norte"]
        }
      }));
      const result = await runPublicCheck(
        "tallerdeideas.es",
        deps({
          extract: async () => {
            throw new ExtractionError("config", "OpenAI API rejected the request.");
          },
          extractFallback
        })
      );
      expect(extractFallback).toHaveBeenCalledTimes(1);
      if (result.status !== "completed") throw new Error("esperaba completed");
      expect(result.answer).toBe("Te recomiendo Estudio Norte y Cuarto Piso.");
      expect(result.otherBrands).toEqual(["Estudio Norte"]);
    });

    it("recuperarse NO borra el incidente: la causa sigue llegando al operador", async () => {
      // Una degradación silenciosa es cómo los 429 de OpenAI corrieron cuatro
      // días sin que nadie se enterara (docs/adr/0029).
      const result = await runPublicCheck(
        "tallerdeideas.es",
        deps({
          extract: async () => {
            throw new ExtractionError("config", "OpenAI API rejected the request.");
          },
          extractFallback: async () => ({
            data: { brand: { mentioned: false, position: null }, citations: [], other_brands_mentioned: [] }
          })
        })
      );
      expect(result).toMatchObject({ status: "completed", detail: "fallback:config" });
    });

    it("si también cae la reserva, se declaran las DOS causas y no hay resultado", async () => {
      const result = await runPublicCheck(
        "tallerdeideas.es",
        deps({
          extract: async () => {
            throw new ExtractionError("config", "rechazado");
          },
          extractFallback: async () => {
            throw new ExtractionError("quota", "sin cuota");
          }
        })
      );
      expect(result).toMatchObject({
        status: "failed",
        error: "extraction_failed",
        detail: "config+quota"
      });
    });

    it("la reserva sólo lee: la respuesta que ve el visitante sigue siendo la del motor principal", async () => {
      const generateAnswer = vi.fn(async () => ({ text: "La respuesta de ChatGPT." }));
      const result = await runPublicCheck(
        "tallerdeideas.es",
        deps({
          generateAnswer,
          extract: async () => {
            throw new ExtractionError("http", "caído");
          },
          extractFallback: async () => ({
            data: { brand: { mentioned: false, position: null }, citations: [], other_brands_mentioned: [] }
          })
        })
      );
      expect(generateAnswer).toHaveBeenCalledTimes(1);
      if (result.status !== "completed") throw new Error("esperaba completed");
      expect(result.engine).toBe(PUBLIC_CHECK_ENGINE);
      expect(result.answer).toBe("La respuesta de ChatGPT.");
    });

    it("no arranca la reserva si no cabe en la invocación", async () => {
      // 20 s por consulta al reloj: los tres primeros pasos caben, y cuando la
      // extracción falla ya no queda presupuesto para una segunda.
      let clock = 0;
      const now = () => {
        clock += 7_000;
        return clock;
      };
      const extractFallback = vi.fn(async () => ({
        data: { brand: { mentioned: false, position: null }, citations: [], other_brands_mentioned: [] }
      }));
      const result = await runPublicCheck(
        "tallerdeideas.es",
        deps({
          now,
          extract: async () => {
            throw new ExtractionError("timeout", "se pasó");
          },
          extractFallback
        }),
        { deadlineAt: 50_000 }
      );
      expect(extractFallback).not.toHaveBeenCalled();
      expect(result).toMatchObject({ status: "failed", error: "extraction_failed", detail: "timeout" });
    });

    it("le pasa al proveedor un deadline que deja terminar el intento que empiece", async () => {
      // El bucle de reintentos sólo garantiza "no EMPIEZO uno pasado el
      // deadline": con el de la invocación a pelo, un intento arrancado en el
      // último milisegundo se come 20 s de más y Vercel devuelve un 504 sin
      // cuerpo, con el dinero ya gastado (.claude/rules/scan.md, docs/adr/0037).
      const extract: PublicCheckDeps["extract"] = vi.fn(async () => ({
        data: { brand: { mentioned: false, position: null }, citations: [], other_brands_mentioned: [] }
      }));
      await runPublicCheck("tallerdeideas.es", deps({ extract, now: () => 0 }), { deadlineAt: 52_000 });
      expect(vi.mocked(extract).mock.calls[0]?.[0]?.deadlineAt).toBe(52_000 - PUBLIC_CHECK_STEP_BUDGET_MS);
    });
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
