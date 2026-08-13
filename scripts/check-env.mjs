#!/usr/bin/env node
/**
 * PRELAUNCH-HARDENING-1 Fase R4 — informe del entorno actual.
 *
 *   pnpm run check:env            # informa y sale 0 salvo que haya errores
 *   pnpm run check:env --quiet    # sólo problemas
 *
 * Es la mitad visible de la fase. El esquema por sí solo no arregla nada: lo
 * que arregla algo es que alguien pueda ver, ANTES de desplegar, que su
 * `OPENAI_API_KEY` está puesta y su `OPENAI_MODEL` no — que es una
 * configuración que arranca perfectamente y luego falla en cada escaneo.
 *
 * Lee el `.env.local` si existe, igual que hace `scripts/pilot.mjs`, para que
 * en local informe de lo que el producto va a ver de verdad y no de un entorno
 * vacío.
 */

import { existsSync, readFileSync } from "node:fs";

// El esquema es TypeScript y se importa tal cual: Node 22 despoja los tipos en
// caliente, así que no hay build previo ni una copia del esquema en JS que
// pudiera desincronizarse. El `package.json` lanza este script con
// `--experimental-strip-types` donde haga falta.

function loadEnvLocal() {
  if (!existsSync(".env.local")) return 0;
  let loaded = 0;
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (process.env[key] === undefined) {
      process.env[key] = value;
      loaded += 1;
    }
  }
  return loaded;
}

const quiet = process.argv.includes("--quiet");

const loaded = loadEnvLocal();

const { inspectEnv, DECLARED_ENV_VARS, ENV_CONSEQUENCE } = await import("../lib/env-schema.ts");

const { env, problems } = inspectEnv(process.env);

const errors = problems.filter((p) => p.severity === "error");
const warnings = problems.filter((p) => p.severity === "warning");

if (!quiet) {
  console.log(`\nContrato de entorno — ${DECLARED_ENV_VARS.length} variables declaradas`);
  if (loaded) console.log(`(${loaded} leídas de .env.local)`);
  console.log("");

  for (const key of DECLARED_ENV_VARS) {
    const value = env[key];
    const present = value !== undefined && value !== "" && value !== false;
    // Nunca se imprime un valor: esto puede correr en un log de CI.
    const mark = present ? "·" : " ";
    const shown = typeof value === "boolean" || typeof value === "number" ? String(value) : present ? "(puesta)" : "—";
    console.log(`  ${mark} ${key.padEnd(32)} ${shown}`);
  }
  console.log("");
}

for (const problem of errors) {
  console.error(`✗ ${problem.variable}: ${problem.message}`);
  const consequence = ENV_CONSEQUENCE[problem.variable];
  if (consequence && !problem.message.includes(consequence)) console.error(`    ${consequence}`);
}
for (const problem of warnings) {
  console.warn(`! ${problem.variable}: ${problem.message}`);
}

if (errors.length === 0 && warnings.length === 0) {
  console.log("Sin problemas de configuración.");
}

console.log("\nDetalle de cada variable: docs/environment-contract.md\n");

process.exit(errors.length > 0 ? 1 : 0);
