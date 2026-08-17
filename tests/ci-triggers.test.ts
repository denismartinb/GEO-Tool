import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * La puerta de CI tiene DOS disparadores, y eso no se toca sin saberlo.
 *
 * **El fallo que evita.** `pull_request` se pierde. Medido: el 2026-08-10, en
 * la misma rama y la misma tarde, tres pushes no dispararon `ci.yml` y dos sí;
 * el 2026-08-16 se perdió **dos veces seguidas** en el PR #427, y al reponerlo
 * a mano apareció un fallo real que llevaba una hora invisible. Cuando eso
 * pasa, la cabeza de un PR llega al Human Gate **sin que se haya ejecutado un
 * solo test**, y nada en la interfaz lo dice: la ausencia de un check no se ve,
 * a diferencia de uno rojo.
 *
 * `push` cubre ese hueco. Este test existe porque la redundancia parece
 * duplicación: alguien que abra `ci.yml` dentro de seis meses verá dos
 * disparadores para lo mismo, quitará uno «por limpieza», y devolverá la
 * puerta a depender de un evento que se pierde. El coste de esa limpieza no se
 * nota el día que se hace, sino el día que se pierde el evento.
 *
 * **Lo que este test NO puede afirmar, dicho claro:** que la puerta esté
 * puesta. Que `ci.yml` *exista* y *se dispare* no impide mergear con él en
 * rojo — eso es una *required status check* en la protección de rama, que es
 * un ajuste del repositorio y no vive en este repositorio (log §97).
 */

const CI = join(process.cwd(), ".github", "workflows", "ci.yml");

function ciSource(): string {
  return readFileSync(CI, "utf8");
}

/** El bloque `on:` — desde `on:` hasta la siguiente clave de primer nivel. */
function triggerBlock(): string {
  const source = ciSource();
  const start = source.indexOf("\non:");
  expect(start, "ci.yml no tiene bloque `on:`").toBeGreaterThan(-1);
  const rest = source.slice(start + 1);
  const end = rest.search(/\n[a-z]/);
  return end === -1 ? rest : rest.slice(0, end);
}

describe("ci.yml conserva sus dos disparadores independientes", () => {
  it.each(["pull_request:", "push:", "workflow_dispatch:"])("mantiene `%s`", (trigger) => {
    expect(
      triggerBlock(),
      `Falta \`${trigger}\` en el bloque \`on:\` de ci.yml.\n` +
        "Los tres están a propósito: `pull_request` es el disparador natural pero SE PIERDE " +
        "(dos veces seguidas el 2026-08-16), `push` es la red que cubre esa pérdida, y " +
        "`workflow_dispatch` es la reposición a mano cuando fallan los dos.\n" +
        "Si de verdad hay que quitar uno, que sea una decisión con su motivo escrito, no una limpieza."
    ).toContain(trigger);
  });

  /**
   * Las ramas de evidencia del piloto no llevan `package.json`, así que
   * `pnpm install --frozen-lockfile` falla ahí **siempre**. Un check rojo por
   * diseño es exactamente lo que entrena a ignorar la lista de checks — el
   * mecanismo por el que 1.603 ejecuciones en rojo pasaron cuatro meses
   * desapercibidas (log §105).
   */
  it("el disparador `push` excluye las ramas de evidencia del piloto", () => {
    expect(
      triggerBlock(),
      "`push` sin excluir `pilot-evidence/**` pondría CI a correr sobre ramas que no son " +
        "código (sin `package.json`), fallando siempre y por diseño."
    ).toContain("pilot-evidence/**");
  });

  /**
   * Los dos disparadores tienen que caer en grupos de `concurrency` distintos.
   * Unificarlos parece un ahorro obvio —un run en vez de dos— pero
   * `cancel-in-progress` haría que uno cancelase al otro, y **un run cancelado
   * no cuenta como superado**: convertiría la redundancia en un fallo
   * intermitente, que es peor que el problema que vino a resolver.
   */
  it("el grupo de concurrency sigue distinguiendo PR de rama", () => {
    const source = ciSource();
    expect(
      source,
      "El grupo de `concurrency` debe seguir derivándose del número de PR con caída a `github.ref`. " +
        "Un grupo común a los dos disparadores hace que uno cancele al otro, y un run cancelado " +
        "no es un run superado."
    ).toContain("group: ci-${{ github.event.pull_request.number || github.ref }}");
  });
});
