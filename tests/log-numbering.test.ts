import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Un número de sección del histórico es un identificador, no un contador.
 *
 * Mismo problema que `adr-numbering.test.ts` resolvió para `docs/adr/`, en el
 * otro documento que este repositorio usa como índice. Las referencias `log
 * §NN` están por todas partes —CLAUDE.md las lleva en el mapa de zonas, las
 * reglas de ruta las usan para justificar cada invariante, y hay decenas en
 * comentarios de código— y todas dejan de resolver en cuanto dos secciones
 * comparten número: quien la sigue aterriza en una de las dos sin forma de
 * saber cuál era.
 *
 * **Pasó de verdad, y por eso existe este fichero.** El 2026-08-14, la rama de
 * SEO-POS-1 S8 abrió su entrada como §78 mientras PRELAUNCH-HARDENING-1 R5/R6
 * mergeaba §78 a §82 en `main`. Las dos ramas eran correctas por separado:
 * cada una calculó `max + 1` sobre su propia base, que envejeció en cuanto la
 * otra mergeó. Y lo peor es que **git no lo para**: los dos bloques son
 * apéndices adyacentes al final del mismo fichero, así que se mezclan sin un
 * solo marcador de conflicto y el resultado tiene dos §78 sin que nada chille.
 * Se cogió a mano, revisando la mergeabilidad antes del Human Gate; a mano no
 * es un mecanismo.
 *
 * Límite honesto, el mismo que el de los ADR: esta prueba sólo ve una rama.
 * Detecta el choque contra lo que ya está en `main`, que es el caso que rompe
 * referencias publicadas. Dos ramas que corren a por el mismo número libre
 * pasan las dos en verde y el choque aflora en la que mergee segunda — que es
 * exactamente cuando este test la parará.
 */
describe("numeración del histórico de decisiones", () => {
  const fichero = path.resolve(__dirname, "../docs/brand/design-decisions-log.md");
  const texto = readFileSync(fichero, "utf8");

  /** Encabezados de sección numerada: `## NN. Título`. */
  const secciones = [...texto.matchAll(/^## (\d+)\. (.+)$/gm)].map((m) => ({
    numero: Number(m[1]),
    titulo: m[2]
  }));

  it("hay secciones que comprobar (si no, el resto pasaría en vacío)", () => {
    expect(secciones.length).toBeGreaterThan(20);
  });

  /**
   * Colisiones que YA estaban en `main` cuando se escribió este guardián:
   * **siete**, de §33 a §70. No fue mala suerte de una rama — el fallo llevaba
   * ocurriendo desde principios de agosto, una vez cada pocos días, y todas
   * las veces en silencio. Al menos dos son visibles desde el mapa de zonas de
   * CLAUDE.md, que apunta a «log §54» desde dos filas distintas y a dos
   * secciones distintas.
   *
   * No se arreglan aquí **a propósito**. Renumerar una sección ya mergeada
   * rompe todas las referencias publicadas que la apuntan, que es exactamente
   * el coste que `adr-numbering.test.ts` documenta haber pagado con `0026`.
   * Siete secciones y sus referencias merecen su propia pasada deliberada, con
   * el barrido hecho a conciencia — no de propina en un PR de contenido, donde
   * nadie las revisaría.
   *
   * MISMO PATRÓN que `COVER_DEBT` y `PENDING_CONVERSION`: **solo puede
   * encoger**, y la línea base se fija literalmente abajo para que no encoja
   * por accidente arrastrada por el mismo `sed` que arregle una entrada.
   */
  const DUPLICADOS_HEREDADOS = new Set([33, 36, 39, 54, 55, 65, 70]);

  it("la deuda heredada es exactamente la que había al crear el guardián", () => {
    // Sin esto se puede sacar un número de la lista y meter otro nuevo,
    // mantener el tamaño en 7, y con ello eximir una colisión recién
    // introducida. Es el error que la línea base de `article-recipes` ya se
    // comió dos veces.
    expect([...DUPLICADOS_HEREDADOS].sort((a, b) => a - b)).toEqual([33, 36, 39, 54, 55, 65, 70]);
  });

  it("ningún número de sección nuevo está duplicado", () => {
    const porNumero = new Map<number, string[]>();
    for (const { numero, titulo } of secciones) {
      porNumero.set(numero, [...(porNumero.get(numero) ?? []), titulo]);
    }

    const duplicados = [...porNumero.entries()]
      .filter(([numero, lista]) => lista.length > 1 && !DUPLICADOS_HEREDADOS.has(numero))
      .map(([numero, lista]) => `§${numero}: ${lista.map((t) => t.slice(0, 60)).join("  +  ")}`);

    // `pnpm run fix:log-numbering` hace exactamente esto a mano: renumera la
    // sección que NO está en `origin/main` y actualiza sus referencias — pero
    // sólo en las líneas que esta rama añadió, nunca en las de la otra sección
    // (scripts/fix-log-numbering-core.ts, log §110). Si el autofix devuelve una
    // colisión "que necesita una decisión humana", es que las dos secciones ya
    // están en `main` (dos PRs ajenos chocaron entre sí) y hay que renumerar a
    // mano la que mergeó después.
    expect(
      duplicados,
      duplicados.length > 0
        ? `Dos secciones del histórico comparten número:\n${duplicados.join("\n")}\n` +
            `Ejecuta \`git fetch origin main && pnpm run fix:log-numbering\`.`
        : ""
    ).toEqual([]);
  });

  it("toda referencia `log §NN` del repositorio apunta a una sección que existe", () => {
    // Una referencia a una sección inexistente es el mismo fallo por el otro
    // lado: sobrevive a un renumerado a medias, que es como se rompe de verdad.
    const existentes = new Set(secciones.map((s) => s.numero));
    const referidas = [...texto.matchAll(/log §(\d+)/g)].map((m) => Number(m[1]));
    const rotas = [...new Set(referidas)].filter((n) => !existentes.has(n));
    expect(rotas, `el histórico se referencia a secciones que no existen: ${rotas.join(", ")}`).toEqual([]);
  });
});
