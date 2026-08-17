#!/usr/bin/env node
/**
 * Entrada de CLI para `scripts/fix-log-numbering-core.ts` — mismo patrón que
 * `check-env.mjs`: la lógica vive en un módulo TypeScript con tipos y tests
 * propios; esto sólo la invoca. Node 22 despoja los tipos en caliente con
 * `--experimental-strip-types` (ver el `package.json`), así que no hace falta
 * build previo ni una copia en JS que pudiera desincronizarse.
 *
 *   pnpm run fix:log-numbering [-- --main-ref=origin/main]
 */

const { main } = await import("./fix-log-numbering-core.ts");

const mainRefArg = process.argv.find((a) => a.startsWith("--main-ref="));
const code = main(mainRefArg ? { mainRef: mainRefArg.split("=")[1] } : {});
process.exit(code);
