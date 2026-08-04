#!/usr/bin/env node
/**
 * Verificación de completitud de la extracción (SCAN-CHAIN-2, PR #317).
 *
 * El bug que arregla esa PR era invisible: la extracción analizaba 20 de 300
 * respuestas y el escaneo terminaba "bien", con la nota mal calculada y sin
 * un solo error en pantalla. Por eso **la verificación no puede ser visual**.
 * Ningún pilot, ninguna captura y ninguna revisión a ojo distingue un run
 * correcto de uno truncado: hay que preguntárselo a la base de datos.
 *
 * Esto es lo que este script comprueba, para un run concreto:
 *
 *   1. NINGUNA fila elegible se quedó sin extraer. Es la invariante que el
 *      bug rompía.
 *   2. El run llegó a `done` y tiene puntuación. Si la extracción encadenada
 *      se pierde por el camino, el run se queda a medias — un fallo distinto
 *      y también silencioso.
 *   3. Hubo encadenado de verdad. Si el run no superó una tanda, ha pasado
 *      en verde sin ejercitar nada: eso NO es una verificación, y el script
 *      lo dice en vez de dar un OK tranquilizador.
 *
 * Uso:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/verify-extraction-completeness.mjs <run_id>
 *
 * Sale 0 si la extracción fue completa y significativa; 1 en cualquier otro
 * caso. Es de solo lectura: no escribe nada, no lanza escaneos y no cuesta
 * dinero.
 */

import { readFileSync } from "node:fs";

/**
 * Las dos constantes se LEEN de `lib/scan/constants.ts`, no se copian.
 *
 * Al escribir este script las copié a mano y puse `grounded-position-v1`
 * cuando la real es `verified-mention-v1`: el script habría dado por no
 * extraída absolutamente toda fila, es decir, habría gritado que el bug
 * seguía ahí en un run perfectamente correcto. Una herramienta de
 * verificación que se desincroniza del código que verifica es peor que no
 * tenerla, porque su veredicto parece autoridad.
 */
function leerConstante(nombre) {
  const src = readFileSync(new URL("../lib/scan/constants.ts", import.meta.url), "utf8");
  const cadena = src.match(new RegExp(`export const ${nombre} = "([^"]+)"`));
  if (cadena) return cadena[1];
  const expr = src.match(new RegExp(`export const ${nombre} = ([^;]+);`));
  if (expr) {
    // p. ej. `MAX_REAL_SCAN_PROMPTS * 3`
    const nums = expr[1].match(/(\w+)\s*\*\s*(\d+)/);
    if (nums) {
      const base = src.match(new RegExp(`export const ${nums[1]} = (\\d+)`));
      if (base) return Number(base[1]) * Number(nums[2]);
    }
    const plano = expr[1].trim().match(/^\d+$/);
    if (plano) return Number(plano[0]);
  }
  console.error(`No se pudo leer ${nombre} de lib/scan/constants.ts. ¿Cambió su forma?`);
  process.exit(1);
}

const EXTRACTION_VERSION = leerConstante("EXTRACTION_VERSION");
const EXTRACTION_BATCH_SIZE = leerConstante("EXTRACTION_BATCH_SIZE");

const runId = process.argv[2];
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!runId) {
  console.error("Falta el run_id.\n  node scripts/verify-extraction-completeness.mjs <run_id>");
  process.exit(1);
}
if (!url || !key) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

async function q(path) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }
  });
  if (!res.ok) {
    console.error(`Consulta fallida (${res.status}): ${path}`);
    process.exit(1);
  }
  return res.json();
}

const rows = await q(
  `scan_prompt_results?run_id=eq.${runId}&status=eq.completed` +
    `&select=id,provider,extraction_version,extraction_error,raw_response_text`
);

if (rows.length === 0) {
  console.error(`El run ${runId} no tiene ninguna respuesta completada. ¿Run correcto?`);
  process.exit(1);
}

// Misma definición de "elegible" que lib/scan/extraction.ts: hay texto que
// analizar y la extracción no falló ya para esa fila.
const elegibles = rows.filter((r) => r.raw_response_text && !r.extraction_error);
const sinExtraer = elegibles.filter((r) => r.extraction_version !== EXTRACTION_VERSION);
const conError = rows.filter((r) => r.extraction_error);
const motores = [...new Set(rows.map((r) => r.provider))];

const [run] = await q(`scan_runs?id=eq.${runId}&select=status,error_summary`);
const scores = await q(`run_scores?run_id=eq.${runId}&select=run_id`);

console.log(`\nRun ${runId}`);
console.log(`  Respuestas completadas : ${rows.length}  (motores: ${motores.join(", ") || "—"})`);
console.log(`  Elegibles para extraer : ${elegibles.length}`);
console.log(`  SIN extraer            : ${sinExtraer.length}`);
console.log(`  Con error de extracción: ${conError.length}`);
console.log(`  Estado del run         : ${run?.status ?? "—"}`);
console.log(`  Tiene puntuación       : ${scores.length > 0 ? "sí" : "NO"}\n`);

const fallos = [];

if (sinExtraer.length > 0) {
  fallos.push(
    `${sinExtraer.length} de ${elegibles.length} respuestas se quedaron SIN extraer. ` +
      "Es exactamente el bug que SCAN-CHAIN-2 arregla: la nota está mal calculada."
  );
}
if (run?.status !== "done") {
  fallos.push(`El run terminó en "${run?.status}", no en "done". ${run?.error_summary ?? ""}`.trim());
}
if (scores.length === 0) {
  fallos.push("El run no tiene puntuación: la extracción encadenada no llegó a cerrar.");
}

// Un run que cabe en una sola tanda no demuestra nada sobre el encadenado.
// Decirlo importa más que el propio OK: un verde aquí sería engañoso.
const ejercitoEncadenado = elegibles.length > EXTRACTION_BATCH_SIZE;

if (fallos.length > 0) {
  console.error("FALLO:");
  for (const f of fallos) console.error(`  · ${f}`);
  process.exit(1);
}

if (!ejercitoEncadenado) {
  console.error(
    `NO CONCLUYENTE: ${elegibles.length} respuestas caben en una sola tanda ` +
      `(${EXTRACTION_BATCH_SIZE}), así que este run NO ha ejercitado el encadenado.\n` +
      `  Repite con más de ${Math.ceil(EXTRACTION_BATCH_SIZE / Math.max(motores.length, 1))} prompts ` +
      `para ${motores.length || "N"} motores.`
  );
  process.exit(1);
}

console.log(
  `OK: las ${elegibles.length} respuestas elegibles están extraídas, el run cerró con puntuación, ` +
    `y con ${elegibles.length} filas hicieron falta ~${Math.ceil(elegibles.length / EXTRACTION_BATCH_SIZE)} tandas encadenadas.\n`
);
