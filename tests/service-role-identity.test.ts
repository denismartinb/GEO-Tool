import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/**
 * PRELAUNCH-HARDENING-1 Fase Q4 — guarda estructural del rol de servicio.
 *
 * `createServiceClient()` **salta RLS**. Cada vez que aparece en `app/`, la
 * única cosa que impide que un usuario toque datos de otro es que ese fichero
 * establezca la identidad por su cuenta, en servidor. Hoy los doce sitios lo
 * hacen; el riesgo no son ésos, es **el decimotercero** — el que alguien añada
 * dentro de tres meses copiando el patrón a medias.
 *
 * Un test por sitio no cazaría eso: sólo cubre lo que ya existe. Por eso esto
 * es una guarda estructural, del mismo tipo que `env-drift.test.ts` o
 * `console-css-scope.test.ts` — comprueba una propiedad de TODO el directorio,
 * así que el fichero nuevo entra en el alcance solo.
 *
 * **Qué NO demuestra, dicho claro:** que la comprobación sea *correcta*. Ve que
 * el fichero establece identidad, no que la aplique al dato que toca. Eso sigue
 * siendo revisión humana y `data-guardian`. Lo que impide es lo otro: un uso de
 * rol de servicio en un fichero donde no hay identidad de ninguna clase.
 */

/**
 * Las cuatro formas legítimas de establecer identidad en servidor, hoy:
 *
 * - `requireUser()` — sesión del usuario (`lib/auth.ts`).
 * - `requireActiveProject()` — sesión + propiedad del proyecto, con `notFound()`.
 * - `isAuthorizedInternalRequest()` — secreto compartido de las rutas internas
 *   (crons y auto-llamadas), que no tienen usuario por construcción.
 * - `constructEvent(` — la firma del webhook de Stripe, que es lo que prueba
 *   que la petición viene de Stripe y no de cualquiera.
 *
 * Añadir una quinta forma a esta lista es una decisión, no un trámite: es
 * exactamente el momento de preguntarse si de verdad hace falta.
 */
const IDENTITY_GATES = [
  "requireUser(",
  "requireActiveProject(",
  "isAuthorizedInternalRequest(",
  "constructEvent("
] as const;

function serviceRoleFilesInApp(): string[] {
  // `git grep --untracked` para que un fichero recién creado y aún sin
  // commitear también entre — es justo cuando esta guarda hace falta (mismo
  // motivo que en `env-drift.test.ts`).
  const output = execFileSync(
    "git",
    ["grep", "--untracked", "-l", "createServiceClient(", "--", "app/"],
    { encoding: "utf8" }
  );

  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.includes(".test."));
}

describe("todo uso del rol de servicio en app/ establece identidad en servidor", () => {
  it("hay sitios que vigilar (si esto falla, el grep dejó de encontrar nada)", () => {
    expect(serviceRoleFilesInApp().length).toBeGreaterThan(0);
  });

  it.each(serviceRoleFilesInApp())("%s", (file) => {
    const source = readFileSync(file, "utf8");
    const gate = IDENTITY_GATES.find((needle) => source.includes(needle));

    expect(
      gate,
      `${file} usa createServiceClient() —que salta RLS— y no establece identidad de ninguna forma conocida.\n` +
        `Formas válidas hoy: ${IDENTITY_GATES.join(", ")}.\n` +
        `Si de verdad hace falta una nueva, añádela a IDENTITY_GATES a conciencia, no para poner el test en verde.`
    ).toBeDefined();
  });
});
