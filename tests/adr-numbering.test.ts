import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Un número de ADR es un identificador, no un contador.
 *
 * Cada referencia en el código es un `docs/adr/NNNN` pelado — `run-scoring.ts`,
 * `extraction.ts`, `scan-lifecycle.md` y una docena más. Cuando dos ADR
 * comparten número, ese puntero deja de resolver: quien lo sigue aterriza en
 * uno de los dos y no tiene forma de saber cuál era.
 *
 * Pasó de verdad, dos veces en la misma semana. `0026` lo reclamaron a la vez
 * `article-imagery-policy` y `position-when-mentioned`, y los dos se mergearon;
 * al arreglarlo hubo que renumerar uno YA mergeado y romper sus enlaces.
 * `0027` lo reclamaron cuatro ramas abiertas a la vez.
 *
 * La causa no es descuido: varias sesiones agénticas trabajan en paralelo y
 * cada una calcula `max + 1` sobre su propia base, que envejece en cuanto otra
 * mergea. Con ese patrón la colisión es el resultado esperado, así que hace
 * falta algo que la pare — y una convención escrita no para nada.
 *
 * Límite honesto de esta prueba: solo ve una rama. Detecta el choque contra lo
 * que ya está en `main`, que es el caso que rompe enlaces publicados. Dos ramas
 * que corren a por el mismo número libre pasan las dos en verde, y el choque
 * aflora en la que mergee segunda. Ver ADR 0001 §Numeración.
 */
describe("numeración de los ADR", () => {
  const dir = path.resolve(__dirname, "../docs/adr");
  const ficheros = readdirSync(dir).filter((f) => f.endsWith(".md"));

  it("hay ADR que comprobar (si no, el resto de la suite pasaría en vacío)", () => {
    expect(ficheros.length).toBeGreaterThan(0);
  });

  it("todos los nombres siguen el formato NNNN-titulo.md", () => {
    const malFormados = ficheros.filter((f) => !/^\d{4}-[a-z0-9]+(?:-[a-z0-9.]+)*\.md$/.test(f));
    expect(malFormados).toEqual([]);
  });

  it("ningún número de ADR está duplicado", () => {
    const porNumero = new Map<string, string[]>();
    for (const fichero of ficheros) {
      const numero = fichero.slice(0, 4);
      porNumero.set(numero, [...(porNumero.get(numero) ?? []), fichero]);
    }

    const duplicados = [...porNumero.entries()]
      .filter(([, lista]) => lista.length > 1)
      .map(([numero, lista]) => `${numero}: ${lista.join(" + ")}`);

    // El mensaje dice el siguiente número libre, porque el fallo se arregla
    // renumerando y buscarlo a mano es exactamente el paso que se salta quien
    // provocó la colisión.
    const maximo = Math.max(...ficheros.map((f) => Number(f.slice(0, 4))));
    expect(
      duplicados,
      duplicados.length > 0
        ? `Dos ADR comparten número. Renumera el que NO esté en main — el siguiente libre es ${String(maximo + 1).padStart(4, "0")}. Ver ADR 0001 §Numeración.`
        : ""
    ).toEqual([]);
  });
});
