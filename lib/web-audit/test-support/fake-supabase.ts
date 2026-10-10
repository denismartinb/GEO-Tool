/**
 * Shared PostgREST double for the Auditoría SEO and coverage loaders' tests
 * (`page-data.test.ts`, `coverage-section-data.test.ts`). Lives outside both
 * so the two suites exercise their loaders against the same fake.
 */

export type TableResult = { data: unknown; count?: number | null };

/**
 * Un doble del constructor de consultas de PostgREST: cada método encadenable
 * se devuelve a sí mismo y el resultado se resuelve por tabla. Con esto basta
 * porque el módulo no depende de QUÉ filtros aplica —eso lo prueba producción
 * contra RLS— sino de qué hace con las filas que vuelven.
 *
 * `scan_runs` es la primera tabla con DOS consultas distintas en la misma
 * carga (el último run completado, vía `maybeSingle`, y los 5 más recientes
 * de cualquier estado, vía `limit`, para detectar `activeRun`) — un valor
 * único por tabla ya no basta para distinguirlas. Un fixture puede seguir
 * siendo un `TableResult` (se reutiliza en cada llamada, como hasta ahora) o
 * un ARRAY de `TableResult` (uno por llamada, en el orden en que
 * el cargador las hace) cuando a una tabla le hace falta responder
 * distinto la segunda vez.
 */
export function fakeSupabase(byTable: Record<string, TableResult | TableResult[]>) {
  const calls: string[] = [];
  const callCounts: Record<string, number> = {};
  const resultFor = (table: string): TableResult => {
    const entry = byTable[table];
    if (Array.isArray(entry)) {
      const index = callCounts[table] ?? 0;
      callCounts[table] = index + 1;
      return entry[index] ?? entry[entry.length - 1] ?? { data: null };
    }
    return entry ?? { data: null };
  };

  const builder = (table: string) => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    for (const method of ["select", "eq", "is", "in", "order", "limit"]) {
      chain[method] = self;
    }
    chain.maybeSingle = async () => resultFor(table);
    // El `await` sobre el propio constructor (una consulta que no acaba en
    // `maybeSingle`) pasa por aquí.
    chain.then = (resolve: (value: TableResult) => unknown) => resolve(resultFor(table));
    return chain;
  };

  return {
    calls,
    client: {
      from: (table: string) => {
        calls.push(table);
        return builder(table);
      }
    }
  };
}

