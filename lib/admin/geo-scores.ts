import "server-only";

import type { createServiceClient } from "@/lib/supabase/service";
import { GEO_SCORE_LOOKBACK_ROWS, resolveGeoScore, type GeoScoreRunRow } from "@/lib/metrics/run-metrics";

type ServiceClient = ReturnType<typeof createServiceClient>;

/**
 * ADMIN-GEO-SCORE-1. La Puntuación GEO de un dominio tal y como la ve su dueño
 * en Visión general: `resolveGeoScore` sobre las `GEO_SCORE_LOOKBACK_ROWS`
 * filas más recientes de `run_scores`, nunca `visibility_score` ni una media
 * propia (TRUST-METRICS-1, log §183: una sola puntuación en todo el producto).
 *
 * - `scored`: hay al menos un escaneo puntuado.
 * - `unscored`: el dominio todavía no tiene ninguno (no es un cero).
 * - `unavailable`: la lectura falló; la consola dice «sin dato», nunca un cero.
 */
export type AdminGeoScore =
  | { state: "scored"; value: number; lowConfidence: boolean; scoredAt: string | null }
  | { state: "unscored" }
  | { state: "unavailable" };

/** Pura: filas de `run_scores` de UN proyecto, más reciente primero. */
export function geoScoreFromRows(rows: readonly GeoScoreRunRow[] | null | undefined): AdminGeoScore {
  if (!rows || rows.length === 0) return { state: "unscored" };
  const result = resolveGeoScore(rows);
  return {
    state: "scored",
    value: result.value,
    lowConfidence: result.lowConfidence,
    scoredAt: rows[0].created_at ?? null
  };
}

/**
 * Proyectos leídos a la vez. Una consulta por proyecto con su propio
 * `limit(GEO_SCORE_LOOKBACK_ROWS)`: es la única forma de leer «las 7 últimas
 * de cada uno» sin traer el historial entero de la plataforma (y su
 * `details_json`) a la memoria de la función.
 */
const CONCURRENCY = 8;

export async function loadGeoScoresByProject(
  service: ServiceClient,
  projectIds: readonly string[]
): Promise<Map<string, AdminGeoScore>> {
  const out = new Map<string, AdminGeoScore>();
  const unique = [...new Set(projectIds)];
  for (let i = 0; i < unique.length; i += CONCURRENCY) {
    const chunk = unique.slice(i, i + CONCURRENCY);
    const results = await Promise.all(chunk.map((projectId) => loadOne(service, projectId)));
    chunk.forEach((projectId, index) => out.set(projectId, results[index]));
  }
  return out;
}

async function loadOne(service: ServiceClient, projectId: string): Promise<AdminGeoScore> {
  try {
    const { data, error } = await service
      .from("run_scores")
      .select("run_id, created_at, visibility_score, details_json")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(GEO_SCORE_LOOKBACK_ROWS);
    if (error) {
      console.error("[geo:admin] run_scores read failed", { projectId, code: error.code });
      return { state: "unavailable" };
    }
    return geoScoreFromRows(data as GeoScoreRunRow[] | null);
  } catch (error) {
    console.error("[geo:admin] run_scores read threw", {
      projectId,
      message: error instanceof Error ? error.message : "unknown"
    });
    return { state: "unavailable" };
  }
}
