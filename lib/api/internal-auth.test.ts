import { describe, expect, it } from "vitest";
import { isAuthorizedInternalRequest } from "@/lib/api/internal-auth";

function requestWith(authorization?: string): Request {
  return new Request("https://example.test/api/cron/whatever", {
    headers: authorization ? { authorization } : {}
  });
}

describe("isAuthorizedInternalRequest", () => {
  it("acepta el secreto correcto con el prefijo Bearer", () => {
    expect(isAuthorizedInternalRequest(requestWith("Bearer s3cr3t"), "s3cr3t")).toBe(true);
  });

  it("rechaza un secreto distinto", () => {
    expect(isAuthorizedInternalRequest(requestWith("Bearer otro"), "s3cr3t")).toBe(false);
  });

  it("rechaza el secreto correcto sin el prefijo Bearer", () => {
    expect(isAuthorizedInternalRequest(requestWith("s3cr3t"), "s3cr3t")).toBe(false);
  });

  it("rechaza cuando no hay cabecera Authorization", () => {
    expect(isAuthorizedInternalRequest(requestWith(), "s3cr3t")).toBe(false);
  });

  /**
   * Fail-closed: sin variable de entorno no entra nadie, ni siquiera quien
   * mande una cabecera que "coincide" con el vacío. Lo cómodo en desarrollo
   * sería abrir la ruta cuando falta el secreto; eso la deja abierta el día
   * que alguien despliegue sin esa variable.
   */
  it("rechaza cuando el secreto no está configurado, pase lo que pase en la cabecera", () => {
    expect(isAuthorizedInternalRequest(requestWith("Bearer "), undefined)).toBe(false);
    expect(isAuthorizedInternalRequest(requestWith("Bearer "), "")).toBe(false);
    expect(isAuthorizedInternalRequest(requestWith(), undefined)).toBe(false);
  });

  /**
   * Un prefijo del secreto correcto no puede pasar. Es el caso que la
   * comparación en tiempo constante existe para no filtrar: con `!==` sobre
   * cadenas, este intento se resuelve más tarde que uno que falla en el primer
   * byte, y esa diferencia es medible.
   */
  it("rechaza un prefijo del secreto correcto", () => {
    expect(isAuthorizedInternalRequest(requestWith("Bearer s3cr3"), "s3cr3t")).toBe(false);
  });

  it("rechaza un secreto más largo que el correcto", () => {
    expect(isAuthorizedInternalRequest(requestWith("Bearer s3cr3t-de-mas"), "s3cr3t")).toBe(false);
  });

  it("no se confunde con espacios ni mayúsculas", () => {
    expect(isAuthorizedInternalRequest(requestWith("bearer s3cr3t"), "s3cr3t")).toBe(false);
    expect(isAuthorizedInternalRequest(requestWith("Bearer  s3cr3t"), "s3cr3t")).toBe(false);
  });

  /**
   * Secretos largos: el hash iguala longitudes, así que un secreto de 128
   * caracteres se compara igual de bien que uno corto.
   *
   * Se prueba con ASCII a propósito. La primera versión de este test usaba
   * acentos y un emoji, y falló al construir la propia `Request`: los valores
   * de cabecera HTTP no admiten caracteres fuera de ASCII/latin-1, así que un
   * secreto así no podría enviarse jamás. El fallo estaba en el test, no en el
   * código.
   */
  it("compara secretos largos sin romperse", () => {
    const secret = "a1B2c3D4".repeat(16);
    expect(isAuthorizedInternalRequest(requestWith(`Bearer ${secret}`), secret)).toBe(true);
    expect(isAuthorizedInternalRequest(requestWith(`Bearer ${secret}x`), secret)).toBe(false);
  });
});
