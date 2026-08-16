import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Contextos válidos en los `if:` de los workflows — log §105.
 *
 * **El fallo que evita, y lo caro que salió.** `codex-build.yml` usaba
 * `secrets.CODEX_AGENT_TOKEN` dentro del `if:` de dos pasos. `secrets` **no
 * es un contexto disponible ahí**: los permitidos en `jobs.<id>.steps.<id>.if`
 * son `github`, `needs`, `strategy`, `matrix`, `job`, `runner`, `env`, `vars`,
 * `steps` e `inputs`. GitHub rechazaba el fichero **entero** y creaba en cada
 * push un run fallido con CERO jobs, cuyo nombre es la ruta del fichero en vez
 * del `name:` — porque no llegó ni a leerlo.
 *
 * Llevaba así desde el 2026-08-02, coló dentro de un PR de blog, y acumuló
 * **1.603 ejecuciones, el 100% en rojo, ninguna con un solo job**. Nunca
 * funcionó ni un día.
 *
 * **Por qué importa más de lo que parece.** El coste no es la marca roja: es
 * que un rojo permanente en cada push entrena a todo el mundo a ignorar la
 * lista de checks. Es el mecanismo exacto por el que un fallo de verdad pasa
 * desapercibido — y esta semana ya hubo dos veces en que `ci.yml` no se
 * disparó y hubo que lanzarlo a mano, en una lista donde algo siempre está
 * rojo por defecto.
 *
 * **Por qué un test y no cuidado.** Un `if:` inválido no rompe nada visible en
 * local: `pnpm test`, `validate` y el piloto no leen los workflows, y el
 * único síntoma vive en una pestaña de GitHub que nadie abre si siempre está
 * roja. Sin esto, el siguiente `secrets.X` en un `if:` vuelve a colarse igual.
 */

const WORKFLOWS = join(process.cwd(), ".github", "workflows");

/**
 * Sólo `secrets`. Es el error real y el que no avisa: los demás contextos no
 * disponibles (`vars` en algunos ámbitos, por ejemplo) tienen usos legítimos
 * que este barrido tosco marcaría en falso, y un guardián con falsos positivos
 * se acaba desactivando — la lección de `naming.test.ts` (log §94).
 */
const FORBIDDEN_IN_IF = /^\s*if:.*\bsecrets\./;

function workflowFiles(): string[] {
  return readdirSync(WORKFLOWS).filter((name) => /\.ya?ml$/.test(name));
}

describe("ningún `if:` de workflow usa un contexto que GitHub no admite ahí", () => {
  const files = workflowFiles();

  it("encuentra workflows (el barrido no se ha quedado vacío)", () => {
    expect(files.length).toBeGreaterThan(3);
  });

  it("`secrets` no aparece en ningún `if:`", () => {
    const offenders: string[] = [];
    for (const name of files) {
      const lines = readFileSync(join(WORKFLOWS, name), "utf8").split("\n");
      lines.forEach((line, i) => {
        if (FORBIDDEN_IN_IF.test(line)) offenders.push(`${name}:${i + 1}: ${line.trim()}`);
      });
    }

    expect(
      offenders,
      "`secrets` no es un contexto disponible en el `if:` de un paso, así que GitHub rechaza " +
        "el workflow ENTERO y lo falla en cada push con cero jobs — sin ejecutar nada y sin " +
        "decir por qué en ningún sitio que se lea.\n" +
        offenders.join("\n") +
        "\nExpón el secreto en `env:` (a nivel de job o de paso) y comprueba `env.NOMBRE`."
    ).toEqual([]);
  });
});
