import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { DECLARED_ENV_VARS, ENV_CONSEQUENCE } from "@/lib/env-schema";

/**
 * El esquema de entorno no puede quedarse atrás del código.
 *
 * **Por qué existe** (PRELAUNCH-HARDENING-1 Fase R4). `lib/env-schema.ts` sólo
 * vale como fuente de verdad si contiene TODAS las variables que el producto
 * lee. Una variable nueva que nadie declare no la valida nadie, no sale en el
 * informe de `check-env`, y vuelve a ser exactamente el agujero que la fase
 * cerraba — con el agravante de que ahora existe un módulo que parece cubrirlo
 * todo.
 *
 * Esto no es hipotético: al escribir la fase, `MAX_SWEEP_CHAIN_INVOCATIONS`
 * llevaba tiempo leyéndose en `lib/scan/cron.ts` sin estar en
 * `docs/environment-contract.md`, y acota cuántas veces encadena el barrido
 * recurrente — o sea, cuánto LLM se gasta. Nadie la había echado de menos
 * porque nada la echaba de menos.
 *
 * Comprobación de TEXTO sobre el código fuente, a propósito: lo que interesa
 * es qué lecturas existen escritas, no cuáles se ejecutan. El precio de eso es
 * que un nombre de variable **inventado dentro de un comentario** es
 * indistinguible de uno real, así que la regla al documentar es citar siempre
 * una variable que exista de verdad en vez de un `FOO` de ejemplo. Ha hecho
 * falta decirlo dos veces en el mismo día.
 */

const PRODUCT_PATHS = ["app", "lib", "components", "middleware.ts"];

/**
 * Variables que se leen en código de producto y que **no** pertenecen al
 * esquema, con el motivo. Vacía salvo por lo de abajo, y cada entrada nueva
 * necesita justificarse: la salida fácil de este test es añadir aquí lo que
 * moleste, y eso lo convierte en decorado.
 */
const NOT_PRODUCT_CONFIG: Record<string, string> = {
  // La inyecta Node/Next, no se configura en Vercel ni en `.env.local`, y su
  // valor lo decide el comando que arranca el proceso.
  NODE_ENV: "la inyecta el runtime, no es configuración del producto"
};

/**
 * `git grep` respeta .gitignore, así que no entra en node_modules ni en .next
 * sin tener que enumerar exclusiones que caducan.
 *
 * **`--untracked` no es opcional.** Sin ella, `git grep` sólo mira ficheros ya
 * trackeados, así que un fichero NUEVO con una variable nueva es invisible
 * para este test hasta después de commitearlo — o sea, ciego justo en el
 * momento para el que existe. Pasó al escribir la propia fase: `lib/env.ts`
 * llevaba un nombre de variable inventado en un comentario, el test pasó en
 * local (fichero sin trackear) y CI lo cazó en el primer push.
 */
function grepProductSource(pattern: string): string[] {
  const output = execFileSync("git", ["grep", "--untracked", "-hoE", pattern, "--", ...PRODUCT_PATHS], {
    encoding: "utf8"
  });
  return output.split("\n").map((line) => line.trim()).filter(Boolean);
}

/** Variables leídas a la vieja usanza, directamente de `process.env`. */
function rawReads(): Set<string> {
  return new Set(grepProductSource("process\\.env\\.[A-Z0-9_]+").map((m) => m.replace("process.env.", "")));
}

/**
 * Variables leídas a través del accesor tipado, `serverEnv().LO_QUE_SEA`.
 *
 * Hace falta contarlas: adoptar el accesor **elimina** el `process.env.X` de
 * ese sitio, que es justo el objetivo de la fase. Sin esto, migrar una
 * variable la convertiría en "huérfana" y el test castigaría la migración que
 * existe para acompañar. Pasó a la primera, con MAX_PROJECTS_PER_CRON_RUN.
 */
function accessorReads(): Set<string> {
  return new Set(
    grepProductSource("serverEnv\\(\\)\\.[A-Z0-9_]+").map((m) => m.replace("serverEnv().", ""))
  );
}

describe("el esquema de entorno sigue al código", () => {
  it("declara todas las variables que el producto lee", () => {
    const inSource = [...rawReads()].filter((name) => !(name in NOT_PRODUCT_CONFIG)).sort();

    const undeclared = inSource.filter((name) => !DECLARED_ENV_VARS.includes(name as never));

    expect(
      undeclared,
      "Estas variables se leen en app/, lib/, components/ o middleware.ts y no están " +
        "en `lib/env-schema.ts`.\n\n" +
        "Una variable sin declarar no la valida nadie y no sale en el informe de " +
        "`pnpm run check:env`, así que vuelve a poder degradarse en silencio — y " +
        "encima ahora hay un módulo que aparenta cubrirlas todas.\n\n" +
        "Añádela al esquema, con su frase en ENV_CONSEQUENCE y su fila en " +
        "docs/environment-contract.md, en este mismo PR."
    ).toEqual([]);
  });

  it("no declara variables que ya no lee nadie", () => {
    // Una variable está viva si alguien la lee, da igual por qué vía: cruda o
    // a través del accesor. Las del arnés del piloto no viven en código de
    // producto y el esquema tampoco las declara.
    const read = new Set([...rawReads(), ...accessorReads()]);
    const orphans = DECLARED_ENV_VARS.filter((name) => !read.has(name as string));

    expect(
      orphans,
      "Estas variables están declaradas en `lib/env-schema.ts` pero ya no las lee " +
        "nadie en código de producto. O el esquema se quedó con una variable muerta, " +
        "o su último lector se borró sin limpiar. Las dos cosas se arreglan aquí."
    ).toEqual([]);
  });

  it("cada variable declarada dice qué se rompe sin ella", () => {
    // Un esquema que valida pero no explica manda a abrir el contrato en cada
    // fallo. El mensaje ES la mitad del valor de esta fase.
    const withoutConsequence = DECLARED_ENV_VARS.filter((name) => !ENV_CONSEQUENCE[name as string]);

    expect(
      withoutConsequence,
      "Falta su línea en ENV_CONSEQUENCE — la frase que se imprime cuando esa " +
        "variable falla, y que evita tener que abrir el contrato para entender el error."
    ).toEqual([]);
  });
});
