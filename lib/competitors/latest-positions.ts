/**
 * PANORAMA-PARITY-1 — the one place "who is ahead of whom in the latest scan"
 * is decided.
 *
 * Two screens answer that question: the Competidores page's "Puesto en el
 * último escaneo" list and the Overview's "Panorámica competitiva". They read
 * the same `brand_position.ranking` off the same run and, until this module,
 * ordered it two different ways — so on the founder's Mozilla project Proton
 * VPN was 1º on one screen and 2º on the other (it ties Amazon at 1,00 and only
 * one of the two screens broke the tie). `.claude/rules/competitors.md` calls
 * that a defect, not a nuance: "dos números con el mismo significado y distinto
 * valor es un fallo" (ADR 0018).
 *
 * What this function does NOT do is compute anything new. The ordering and the
 * 1..N ranking are exactly what the Competidores list already did (log §15);
 * they moved here so a second caller cannot drift from them.
 *
 * The rules it encodes, each traceable to that section of the log:
 *
 * - **A rank is a 1..N order, never the raw mean.** The number behind it is a
 *   mean rank over the prompts where the entity was named, and a mean is almost
 *   never 1,00 — printing it made the list look like nobody was in first place.
 * - **Ties break by mention rate**, because at the same mean rank the brand the
 *   AI names in more answers is genuinely ahead, and that percentage is already
 *   on screen beside the name, so the tiebreak is visible rather than arbitrary.
 *   Name last, purely so the order is stable between renders instead of
 *   depending on the caller's array order.
 * - **No rank means no row.** Under geo-score-v3 an entity the AI never named
 *   has no position at all (docs/adr/0026), and giving it one would invent data.
 */

import { readPosition, type PersistedRankingEntry } from "@/lib/scoring/brand-position-ranking";

/** What a caller must tell us about each entity it wants ranked. */
export type LatestPositionEntity = {
  /** Caller's own stable key — echoed back untouched, for React and for joins. */
  key: string;
  /** Display name, and how a non-brand entity is matched to the persisted ranking. */
  label: string;
  /** The project's own brand. Matched by `is_brand`, never by name. */
  isBrand?: boolean;
};

export type LatestPositionRow<T> = T & {
  /** Mean rank when mentioned, kept for callers that need the underlying value. */
  position: number;
  /** Percentage of the scan's answers that named this entity, 0-100. */
  mentionRate: number | null;
  /** 1..N standing among the entities the AI actually named in this scan. */
  rank: number;
};

function normKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Ranks the entities the AI named in one scan, best first.
 *
 * The brand is matched by `is_brand` rather than by name: a persisted entry's
 * name is whatever was stored when the run was scored, so a brand renamed since
 * then would silently stop matching itself.
 */
export function rankLatestPositions<T extends LatestPositionEntity>({
  entities,
  ranking
}: {
  entities: readonly T[];
  ranking: readonly PersistedRankingEntry[] | null | undefined;
}): Array<LatestPositionRow<T>> {
  const entries = ranking ?? [];

  return entities
    .map((entity) => {
      const match = entity.isBrand
        ? entries.find((e) => e.is_brand)
        : entries.find((e) => !e.is_brand && e.name && normKey(e.name) === normKey(entity.label));
      return {
        ...entity,
        position: readPosition(match),
        mentionRate: typeof match?.mention_rate === "number" ? match.mention_rate : null
      };
    })
    .filter((row): row is typeof row & { position: number } => row.position !== null)
    .sort(
      (a, b) =>
        a.position - b.position ||
        (b.mentionRate ?? -1) - (a.mentionRate ?? -1) ||
        a.label.localeCompare(b.label, "es")
    )
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

/**
 * MEAN-RANK-READS-TRUE-1 (2026-08-27, log §177) — pone cualquier lista en el
 * mismo orden que la clasificación de arriba, para que el gráfico y la tabla que
 * comparten tarjeta hablen del mismo conjunto de marcas.
 *
 * **El fallo que arregla.** En Competidores, la tabla se ordena por
 * `rankLatestPositions` y el gráfico recibía sus series ordenadas por **cuota de
 * voz acumulada**. Como el gráfico sólo enciende las cuatro primeras por
 * defecto, en el proyecto Mozilla del fundador la tabla encabezaba con Amazon /
 * Chrome / Brave y el gráfico dibujaba Mozilla / Chrome / Safari / Edge: dos
 * conjuntos distintos, uno al lado del otro, en la misma tarjeta. Nada fallaba;
 * simplemente no eran lo mismo y nada lo decía.
 *
 * **La marca propia va siempre primera**, aunque la clasificación la ponga
 * séptima. Es la línea que el gráfico dibuja más gruesa y la única que el lector
 * ha venido a ver: dejarla apagada por defecto para enseñar tres competidores
 * sería el mismo tipo de inversión que el §— ya rechazó en las barras de Visión
 * general («forzar que "tus" barras te incluyan cuando eres 6º es la inversión
 * de lo que significa un ranking» — aquí la inversión es la contraria y con el
 * mismo remedio: la marca es un caso aparte, no un competidor más).
 *
 * **Lo que no está en `rankedKeys` conserva su orden** y va detrás. Una marca sin
 * posición en el ÚLTIMO escaneo puede tenerla en los anteriores, así que sigue
 * teniendo línea en el gráfico — sólo que apagada por defecto, que es donde ya
 * estaba.
 */
export function orderByLatestRank<T extends { key: string; isBrand?: boolean }>({
  items,
  rankedKeys
}: {
  items: readonly T[];
  rankedKeys: readonly string[];
}): T[] {
  const rankOf = new Map(rankedKeys.map((key, index) => [key, index]));
  const brand = items.filter((item) => item.isBrand);
  const rest = items.filter((item) => !item.isBrand);

  const ranked = rest
    .filter((item) => rankOf.has(item.key))
    // `sort` de JS es estable, así que empatar es imposible aquí: cada clave
    // aparece una vez en `rankedKeys`.
    .sort((a, b) => rankOf.get(a.key)! - rankOf.get(b.key)!);
  const unranked = rest.filter((item) => !rankOf.has(item.key));

  return [...brand, ...ranked, ...unranked];
}

/**
 * MEAN-RANK-READS-TRUE-1, segunda pasada (2026-08-27, log §177) — qué series
 * nacen encendidas en el gráfico de puestos.
 *
 * **El fallo que arregla, que introdujo la primera pasada.** `orderByLatestRank`
 * pone la marca propia primera, y el gráfico encendía las cuatro primeras. Si tu
 * marca es 5ª, esas cuatro son *tú + los tres primeros*, así que **el 4º se
 * apaga — y el 4º es alguien que te está ganando**. En el proyecto Mozilla del
 * fundador: Amazon 1º, Proton VPN 2º, Chrome 3º, **Brave 4º**, Mozilla 5º, y
 * Brave no salía:
 *
 * > *"¿no debería salir también Brave si está encima de Mozilla?"*
 * > — fundador, 2026-08-27
 *
 * Sí. Esconder por defecto a una marca que te adelanta es justo lo contrario de
 * para qué se mira este bloque.
 *
 * **La regla, ahora:** los `cap` primeros de la clasificación, **más tu marca si
 * no está entre ellos**. La marca propia deja de gastar un hueco de contexto y
 * pasa a sumarse: 4 líneas cuando estás dentro del corte, 5 cuando no.
 *
 * **Por qué esa quinta línea vale su coste.** `DEFAULT_VISIBLE` es 4 porque ocho
 * líneas superpuestas no las lee nadie y porque a partir de ahí las etiquetas de
 * final de línea empiezan a chocar. Pero el caso que produce la quinta es
 * precisamente el que más importa —estás fuera del podio y quieres ver a quién
 * tienes delante— y una línea de más es un precio menor que ocultar a un rival
 * que te gana. La paleta tiene seis tonos, así que la quinta sigue teniendo
 * color propio.
 */
export function defaultVisibleSeriesKeys({
  rankedKeys,
  brandKey,
  cap
}: {
  rankedKeys: readonly string[];
  brandKey: string;
  cap: number;
}): string[] {
  const top = rankedKeys.slice(0, cap);
  return top.includes(brandKey) ? top : [...top, brandKey];
}
