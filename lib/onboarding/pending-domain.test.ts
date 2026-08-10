import { afterEach, describe, expect, it, vi } from "vitest";
import { PENDING_DOMAIN_KEY, takePendingDomain } from "@/lib/onboarding/pending-domain";
import { cleanDomain, isWellFormedDomain } from "@/lib/projects/project-form";

/**
 * El dominio que se escribe en el hero de la landing tiene que llegar al
 * asistente de alta. Hasta 2026-08-10 se tiraba: la portada te invitaba a
 * escribirlo y el asistente te lo volvía a pedir (log §50).
 */

function withStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k)
    }
  });
  return store;
}

afterEach(() => vi.unstubAllGlobals());

describe("el dominio pendiente del hero", () => {
  it("se lee y se consume en la misma llamada", () => {
    const store = withStorage({ [PENDING_DOMAIN_KEY]: "midominio.com" });

    expect(takePendingDomain()).toBe("midominio.com");
    expect(
      store.has(PENDING_DOMAIN_KEY),
      "si no se consume, el SEGUNDO dominio de la cuenta nace relleno con el " +
        "primero — peor que nacer vacío, porque propone algo que nadie pidió"
    ).toBe(false);
    expect(takePendingDomain()).toBe("");
  });

  it("devuelve cadena vacía cuando no hay nada guardado", () => {
    withStorage();
    expect(takePendingDomain()).toBe("");
  });

  it("no revienta si el navegador no da almacenamiento", () => {
    vi.stubGlobal("window", {
      get localStorage(): Storage {
        throw new Error("almacenamiento bloqueado");
      }
    });
    expect(
      () => takePendingDomain(),
      "perder el arrastre es un incordio; tumbar el asistente de alta sería un fallo"
    ).not.toThrow();
    expect(takePendingDomain()).toBe("");
  });
});

describe("sólo se arrastra lo que el asistente aceptaría", () => {
  // El hero guarda con `isWellFormedDomain` y el asistente habilita su botón
  // con `isWellFormedDomain`. Es la MISMA función a propósito: cuando eran dos
  // copias, el hero podía guardar algo que el asistente rechazaba acto seguido.
  it.each([
    ["midominio.com", true],
    ["https://www.midominio.com/precios", true],
    ["sub.dominio.co.uk", true],
    ["  MiDominio.COM  ", true],
    ["sin-punto", false],
    ["dos palabras.com", false],
    ["", false],
    ["-malempiece.com", false]
  ])("%s → %s", (input, expected) => {
    expect(isWellFormedDomain(input)).toBe(expected);
  });

  it("lo que se guarda ya viene limpio, no como se tecleó", () => {
    expect(cleanDomain("HTTPS://WWW.MiDominio.com/precios")).toBe("midominio.com");
  });
});
