import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * DOMAINS-ARCHIVE-RETIRE-1 (log §104) — lo que el modal de bajada de plan
 * promete tiene que existir.
 *
 * **El fallo real que esto evita, y ya había ocurrido.** El modal decía
 * «Archivar es reversible: podrás restaurarlos cuando quieras desde
 * "Dominios"». Esa frase se le enseña a un cliente **en el momento de pagar
 * menos**, mientras elige qué dominios sacrificar — y ya era falsa antes de
 * esta fase: desde `/dashboard/domains` no se podía restaurar nada. Restaurar
 * vivía en `/dashboard/projects`, una pantalla que llevaba fuera del menú
 * desde DOMAINS-REDESIGN-1. Alguien escribió la promesa dando por hecho que la
 * capacidad estaría en la rejilla nueva, y nunca se construyó.
 *
 * Nadie lo notó porque **una promesa falsa no rompe nada**: la pantalla carga,
 * el piloto la marca ✅, y el cliente sólo lo descubre el día que intenta
 * recuperar su dominio. Es el mismo fallo sin síntoma de siempre, con la
 * diferencia de que este se paga en una pantalla de facturación.
 *
 * Este test no comprueba redacción, comprueba **coherencia**: si el modal
 * nombra restaurar, tiene que ser hacia algo que el producto haga hoy.
 */

const modal = readFileSync(join(process.cwd(), "components", "billing", "change-plan-modal.tsx"), "utf8");
const createProject = readFileSync(join(process.cwd(), "lib", "projects", "create-project.ts"), "utf8");

describe("el modal de bajada de plan no promete lo que el producto no hace", () => {
  it("no dice que archivar sea reversible desde «Dominios»", () => {
    expect(
      /restaurarlos|restaurarlo|es reversible/i.test(modal),
      "El modal vuelve a prometer restaurar dominios archivados. Esa pantalla se retiró en " +
        "DOMAINS-ARCHIVE-RETIRE-1 (log §104): no hay dónde restaurarlos. La salida real es volver " +
        "a añadir el dominio, que lo reactiva — di eso, o vuelve a construir la capacidad."
    ).toBe(false);
  });

  it("dice cuál es la salida que sí existe", () => {
    expect(
      modal,
      "El modal tiene que decirle al cliente cómo recuperar un dominio retirado. Sin esa frase, " +
        "retirar un dominio parece definitivo y una bajada de plan se vuelve irreversible a ojos " +
        "de quien la hace."
    ).toMatch(/vuelve a añadirlo/i);
  });

  /**
   * La otra mitad de la coherencia, y la que de verdad importa: la frase de
   * arriba sólo es cierta mientras `createProjectCore` reactive. Si alguien
   * revierte esa rama a rechazar el alta, el modal pasa a mentir otra vez —
   * y esta vez dejando al cliente encerrado, porque tampoco tendría la
   * pantalla de archivados.
   */
  it("y esa salida existe de verdad en el código de alta", () => {
    expect(
      createProject,
      "`createProjectCore` ya no reactiva un dominio archivado, así que la promesa del modal " +
        "(«vuelve a añadirlo») es falsa Y el cliente queda encerrado: sin pantalla de archivados " +
        "y con el alta bloqueada por la fila archivada."
    ).toMatch(/status: "restored"/);
    expect(createProject).toMatch(/is_archived: false/);
    expect(
      createProject.includes('status: "already_archived"'),
      "Ha vuelto la rama que rechaza el alta de un dominio archivado. Era correcta cuando existía " +
        "una pantalla para restaurarlo; hoy es un callejón sin salida."
    ).toBe(false);
  });
});
