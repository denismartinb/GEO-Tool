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
 *
 * **La salida anónima (FREE-CHECKER-1, 2026-08-15).** El comprobador gratuito
 * escribe con rol de servicio y **no tiene identidad que establecer**: su
 * visitante no tiene cuenta, que es el producto entero de esa página. Añadirle
 * una quinta "puerta de identidad" habría sido mentir para poner el test en
 * verde, porque no hay ninguna.
 *
 * Lo que de verdad hace segura esa ruta no es una identidad: es **la tabla que
 * toca**. `public_checks` no tiene datos de cliente ni clave foránea a nada que
 * un cliente posea, así que saltarse RLS ahí no puede exponer la fila de nadie.
 * Por eso la excepción se comprueba por TABLA y no por nombre de fichero: si
 * alguien añade mañana un `.from("projects")` a esa ruta, este test se pone
 * rojo igual — que es exactamente lo que una excepción por nombre no habría
 * hecho.
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

/**
 * Tablas sin un solo dato de cliente. Una ruta anónima puede usar rol de
 * servicio contra ÉSTAS y sólo éstas.
 *
 * Añadir una aquí es afirmar que filtrar esa tabla entera no expone datos de
 * ningún usuario. `public_checks` lo cumple por construcción: sin FK a
 * `projects` ni a `profiles`, y con la IP guardada sólo como hash con sal
 * (migración 0034).
 */
const ANONYMOUS_SAFE_TABLES = ["public_checks"] as const;

/** Cada tabla que el fichero toca vía `.from("…")`. */
function tablesTouched(source: string): string[] {
  return [...source.matchAll(/\.from\(\s*["'`]([a-z0-9_]+)["'`]\s*\)/gi)].map((m) => m[1]);
}

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
    if (gate) return;

    // Sin identidad, la única salida es que no toque nada de nadie.
    const tables = tablesTouched(source);
    const unsafe = tables.filter(
      (t) => !ANONYMOUS_SAFE_TABLES.includes(t as (typeof ANONYMOUS_SAFE_TABLES)[number])
    );

    expect(
      { file, tables, unsafe },
      `${file} usa createServiceClient() —que salta RLS— sin establecer identidad.\n` +
        `Formas válidas hoy: ${IDENTITY_GATES.join(", ")}.\n` +
        `La única alternativa es que toque SÓLO tablas sin datos de cliente ` +
        `(${ANONYMOUS_SAFE_TABLES.join(", ")}), y ésta toca: ${unsafe.join(", ") || "(ninguna tabla)"}.\n` +
        `Si de verdad hace falta ampliar alguna de las dos listas, hazlo a conciencia, no para poner el test en verde.`
    ).toEqual({ file, tables, unsafe: [] });

    // Una ruta anónima que no toca ninguna tabla no necesita rol de servicio.
    expect(tables.length, `${file} usa rol de servicio sin tocar ninguna tabla`).toBeGreaterThan(0);
  });
});
