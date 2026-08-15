import { describe, expect, it } from "vitest";
import {
  DEFAULT_PUBLIC_CHECK_LIMITS,
  checkPublicCheckLimits,
  clientIpFromHeaders,
  hashIp
} from "./rate-limit";

/**
 * FREE-CHECKER-1 Fase B.
 *
 * Lo que estos tests protegen no es "el contador cuenta": es que las tres
 * decisiones que hacen seguro exponer una llamada de pago a internet sigan
 * siendo ciertas — que se falle cerrado, que la IP no se guarde nunca, y que
 * el techo global sea el que manda.
 */

type CountResult = { count: number | null; error: unknown };

/**
 * Cliente de Supabase falso con la forma justa que usa el módulo.
 * `results` se consume en el orden en que el código consulta:
 * global -> ip -> dominio.
 */
function fakeService(results: CountResult[]) {
  const queue = [...results];
  const calls: Array<{ column?: string; value?: string }> = [];

  const makeQuery = (call: { column?: string; value?: string }) => {
    const result = queue.shift() ?? { count: 0, error: null };
    const thenable = {
      gte: () => thenable,
      eq: (column: string, value: string) => {
        call.column = column;
        call.value = value;
        return thenable;
      },
      then: (resolve: (r: CountResult) => unknown) => Promise.resolve(result).then(resolve)
    };
    return thenable;
  };

  return {
    calls,
    service: {
      from: () => ({
        select: () => {
          const call: { column?: string; value?: string } = {};
          calls.push(call);
          return makeQuery(call);
        }
      })
    } as never
  };
}

const INPUT = { ipHash: "hash-abc", domain: "ejemplo.com" };

describe("hashIp", () => {
  it("nunca devuelve la IP, ni siquiera contenida en el hash", () => {
    const hashed = hashIp("203.0.113.7", "salt-de-prueba");
    expect(hashed).not.toContain("203.0.113.7");
    expect(hashed).toMatch(/^[a-f0-9]{64}$/);
  });

  it("el mismo par IP+salt da el mismo hash, para poder contar", () => {
    expect(hashIp("203.0.113.7", "s")).toBe(hashIp("203.0.113.7", "s"));
  });

  it("rotar el salt retira los hashes viejos", () => {
    expect(hashIp("203.0.113.7", "viejo")).not.toBe(hashIp("203.0.113.7", "nuevo"));
  });

  it("sin salt lanza, en vez de guardar un hash precomputable", () => {
    // Un sha256 de una IP sin salt es un diccionario de 4.000 millones de
    // entradas: guardar eso es guardar la IP con pasos extra.
    expect(() => hashIp("203.0.113.7", undefined)).toThrow(/salt/i);
    expect(() => hashIp("203.0.113.7", "")).toThrow(/salt/i);
  });
});

describe("clientIpFromHeaders", () => {
  it("coge la PRIMERA entrada de x-forwarded-for, que es el cliente", () => {
    // Coger la última daría siempre la IP del proxy de Vercel, y el límite
    // por IP contaría a todo internet como un solo visitante — un fallo que
    // se ve exactamente igual que un límite que funciona.
    const headers = new Headers({ "x-forwarded-for": "203.0.113.7, 70.41.3.18, 150.172.238.178" });
    expect(clientIpFromHeaders(headers)).toBe("203.0.113.7");
  });

  it("cae a x-real-ip cuando no hay x-forwarded-for", () => {
    expect(clientIpFromHeaders(new Headers({ "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("devuelve null en vez de inventarse una IP de relleno", () => {
    // Una IP de relleno compartida convertiría el límite por IP en un límite
    // global accidental.
    expect(clientIpFromHeaders(new Headers())).toBeNull();
  });
});

describe("checkPublicCheckLimits", () => {
  it("deja pasar cuando las tres ventanas están por debajo", async () => {
    const { service } = fakeService([
      { count: 10, error: null },
      { count: 0, error: null },
      { count: 0, error: null }
    ]);
    const result = await checkPublicCheckLimits(service, INPUT);
    expect(result).toEqual({ allowed: true, usedToday: 10, globalLimit: 300 });
  });

  it("el techo global manda sobre los otros dos", async () => {
    // Se comprueba primero a propósito: si el producto ha llegado a su techo,
    // el visitante no va a poder comprobar aunque cambie de dominio o de red,
    // y ese es el mensaje que hay que darle.
    const { service, calls } = fakeService([{ count: 300, error: null }]);
    const result = await checkPublicCheckLimits(service, INPUT);
    expect(result).toEqual({ allowed: false, reason: "global_ceiling_reached" });
    // Ni siquiera llegó a consultar por IP ni por dominio.
    expect(calls).toHaveLength(1);
  });

  it("corta por IP", async () => {
    const { service } = fakeService([
      { count: 10, error: null },
      { count: 3, error: null }
    ]);
    const result = await checkPublicCheckLimits(service, INPUT);
    expect(result).toEqual({ allowed: false, reason: "ip_limit_reached" });
  });

  it("corta por dominio, aunque la IP sea nueva", async () => {
    // Es lo que impide quemar el techo del día recomprobando un mismo sitio
    // desde una red distinta cada vez.
    const { service } = fakeService([
      { count: 10, error: null },
      { count: 0, error: null },
      { count: 3, error: null }
    ]);
    const result = await checkPublicCheckLimits(service, INPUT);
    expect(result).toEqual({ allowed: false, reason: "domain_limit_reached" });
  });

  it("falla CERRADO si no se puede contar — las tres consultas", async () => {
    // Fallar abierto aquí es gastar dinero sin poder contarlo, en una ruta
    // que cualquiera en internet puede invocar.
    const globalFails = fakeService([{ count: null, error: new Error("boom") }]);
    await expect(checkPublicCheckLimits(globalFails.service, INPUT)).resolves.toEqual({
      allowed: false,
      reason: "limit_check_failed"
    });

    const ipFails = fakeService([
      { count: 10, error: null },
      { count: null, error: new Error("boom") }
    ]);
    await expect(checkPublicCheckLimits(ipFails.service, INPUT)).resolves.toEqual({
      allowed: false,
      reason: "limit_check_failed"
    });

    const domainFails = fakeService([
      { count: 10, error: null },
      { count: 0, error: null },
      { count: null, error: new Error("boom") }
    ]);
    await expect(checkPublicCheckLimits(domainFails.service, INPUT)).resolves.toEqual({
      allowed: false,
      reason: "limit_check_failed"
    });
  });

  it("cuenta por las columnas indexadas, no por otras", async () => {
    // Si esto se desviara a una columna sin índice, el conteo seguiría siendo
    // correcto y la ruta se volvería lenta en silencio a medida que la tabla
    // crece — justo cuando más tráfico hay.
    const { service, calls } = fakeService([
      { count: 10, error: null },
      { count: 0, error: null },
      { count: 0, error: null }
    ]);
    await checkPublicCheckLimits(service, INPUT);
    expect(calls[1]).toEqual({ column: "ip_hash", value: "hash-abc" });
    expect(calls[2]).toEqual({ column: "domain", value: "ejemplo.com" });
  });

  it("el techo por defecto acota el gasto a una cifra conocida", async () => {
    // ~0,016 $ por comprobación con ChatGPT como motor (generación $0,0117 +
    // extracción $0,0004 + perfil y pregunta en Gemini $0,004). Este test
    // existe para que subir el techo no sea silencioso: dice en voz alta
    // cuánto se está firmando.
    expect(DEFAULT_PUBLIC_CHECK_LIMITS.globalPerDay).toBe(300);
    const COST_PER_CHECK_USD = 0.016;
    const maxDailySpendUsd = DEFAULT_PUBLIC_CHECK_LIMITS.globalPerDay * COST_PER_CHECK_USD;
    expect(maxDailySpendUsd).toBeCloseTo(4.8, 1);
    // Un mes entero agotando el techo cada día. Si esta cota deja de
    // cumplirse, alguien ha subido el techo sin mirar la factura.
    expect(maxDailySpendUsd * 30).toBeLessThan(150);
  });
});
