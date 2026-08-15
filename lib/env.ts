import "server-only";

import { checkEnvRules, envSchema, ENV_CONSEQUENCE, type Env, type EnvProblem } from "./env-schema";

/**
 * PRELAUNCH-HARDENING-1 Fase R4 — el acceso de servidor al entorno, tipado.
 *
 * `import "server-only"` es la primera línea a propósito. Este módulo lee
 * secretos, y en Next una variable que no empiece por `NEXT_PUBLIC_` —
 * `GEMINI_API_KEY`, por ejemplo— no se inyecta en el bundle de cliente: se
 * queda en `undefined`. O sea que importarlo desde un componente de cliente no filtra
 * nada, pero **degrada en silencio** — exactamente el fallo que esta fase
 * persigue. Con `server-only`, ese import rompe el build con un mensaje que
 * dice lo que pasa. La regla de la casa aplicada al módulo que la implementa.
 *
 * El esquema vive aparte (`lib/env-schema.ts`) y es puro, porque `check-env`
 * y los tests tienen que poder usarlo sin arrastrar el runtime de Next.
 *
 * **Por qué es perezoso y no se valida al importar.** Un `throw` en la carga
 * del módulo revienta `next build` entero, y la mayoría de estas variables no
 * hacen falta para construir: fallar la compilación de toda la web porque a
 * una ruta de cron le falta su secreto es peor que el problema. Se parsea en
 * el primer acceso y se cachea.
 */

let cached: Env | null = null;

export function serverEnv(): Env {
  if (!cached) cached = envSchema.parse(process.env);
  return cached;
}

/** Sólo para tests: obliga a releer `process.env` en el siguiente acceso. */
export function resetServerEnvCache(): void {
  cached = null;
}

/**
 * Los problemas de configuración del entorno actual, en el mismo formato que
 * usa `scripts/check-env.mjs`. Se expone para que una ruta de diagnóstico o un
 * arranque puedan reportarlos sin duplicar las reglas.
 */
export function serverEnvProblems(): EnvProblem[] {
  return checkEnvRules(serverEnv(), process.env);
}

/**
 * Lee una variable que este código considera obligatoria, y falla con un
 * mensaje que se explica solo.
 *
 * El mensaje incluye qué se rompe sin ella (`ENV_CONSEQUENCE`) porque un
 * `Missing OPENAI_MODEL` obliga a abrir el contrato para entender la urgencia,
 * y uno que dice "cada llamada a OpenAI fallará" no.
 */
export function requireEnv<K extends keyof Env>(key: K): NonNullable<Env[K]> {
  const value = serverEnv()[key];
  if (value === undefined || value === null || value === "") {
    const consequence = ENV_CONSEQUENCE[key as string];
    throw new Error(
      `Falta la variable de entorno ${String(key)}` +
        (consequence ? ` — ${consequence}` : "") +
        `. Ver docs/environment-contract.md y \`pnpm run check:env\`.`
    );
  }
  return value as NonNullable<Env[K]>;
}
