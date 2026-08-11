import type { IssueCheckKey } from "@/lib/web-audit/issues";

/**
 * SCAN-STATES-3 — the line the re-entry beat is showing right now
 * (`docs/design-reference/scan-states-1/rev6-reentrada.html`, Parte 2).
 *
 * The founder's ask was to "poner en valor todo lo que se hace en la
 * auditoría", in space jargon. The risk that comes free with that ask is
 * inventing capability: mission voice makes anything sound impressive,
 * including things the product does not do.
 *
 * So the guarantee is structural, not editorial: **every line carries the
 * `IssueCheckKey` it describes**, and `audit-ticker.test.ts` asserts that each
 * key is one the audit really computes. A line for a check that does not
 * exist cannot be added without turning the suite red — which is a stronger
 * promise than any comment, because it survives an author who never reads it.
 *
 * Order is presentation, not execution: the audit does not run these
 * sequentially and this carousel must never be read as a live log. That is
 * why no line carries a tick or a count — per-check progress events are not
 * persisted, so a checkmark here would be an invented state.
 */
export type AuditTickerLine = {
  /** Mission-voiced headline. */
  title: string;
  /** What it really checks, in plain Spanish. */
  detail: string;
  /** The real check this describes. Enforced by the test suite. */
  check: IssueCheckKey;
};

/**
 * The sixteen technical checks, in the order they read best.
 *
 * Deliberately excludes the coverage half (`covered` / `NOT_COVERED_NOTE`):
 * that runs only on Pro+ plans, and a Free project watching its first audit
 * would either see lines for work not being done, or see them greyed out with
 * a padlock — which turns a waiting screen into an upsell. Sixteen true lines
 * are plenty (`.claude/rules/web-audit.md`: never present "not in your plan"
 * as "half of it is missing").
 */
export const AUDIT_TICKER_LINES: readonly AuditTickerLine[] = [
  { title: "Sondeando el casco", detail: "Buscamos datos estructurados en tu código: Article, FAQPage, Product, Organization…", check: "structured_data" },
  { title: "Un solo comandante", detail: "Que cada página tenga un único H1, no cero y no cuatro.", check: "single_h1" },
  { title: "Compartimentos estancos", detail: "Al menos dos H2 que partan el contenido en secciones citables.", check: "two_h2" },
  { title: "Respuesta en el primer contacto", detail: "Que el texto responda al principio en vez de calentar motores.", check: "answer_first_intro" },
  { title: "Distintivo de la nave", detail: "El título, entre 15 y 70 caracteres.", check: "title_length" },
  { title: "Transpondedor", detail: "La meta descripción, entre 50 y 160.", check: "description_length" },
  { title: "Placa de identificación", detail: "Open Graph, para cuando alguien te comparte.", check: "open_graph" },
  { title: "Sin zonas restringidas", detail: "Que ninguna página se esté escondiendo con noindex.", check: "noindex" },
  { title: "Rumbo único", detail: "Que la etiqueta canónica apunte a donde tiene que apuntar.", check: "canonical" },
  { title: "Idiomas a bordo", detail: "Que hreflang esté declarado si tu web habla más de un idioma.", check: "hreflang" },
  { title: "Datos en formación", detail: "Listas y tablas: lo que una IA arranca y cita entero.", check: "list_or_table" },
  { title: "Masa suficiente", detail: "Al menos 300 palabras de contenido real por página.", check: "content_length" },
  { title: "Última revisión en bitácora", detail: "Contenido de menos de 6 meses; a partir de 18 ya pesa.", check: "freshness" },
  { title: "Control de acceso", detail: "Si dejas entrar a GPTBot, ClaudeBot, PerplexityBot, Google-Extended…", check: "bot_blocked" },
  { title: "Baliza para la IA", detail: "Si existe llms.txt, el índice que leen los modelos.", check: "llms_txt_missing" },
  { title: "Mapa estelar", detail: "Si existe sitemap.xml y se puede leer.", check: "sitemap_missing" }
];

/** How long each line holds before the next one. */
export const AUDIT_TICKER_INTERVAL_MS = 4_000;

/**
 * Which line to show at `elapsedMs`. Pure, so the rotation is testable
 * without a clock and without a browser — and so the wrap is provably
 * seamless rather than "it looked fine when I watched it".
 */
export function tickerLineAt(elapsedMs: number, lines: readonly AuditTickerLine[] = AUDIT_TICKER_LINES): AuditTickerLine {
  if (lines.length === 0) throw new Error("audit ticker needs at least one line");
  const safeElapsed = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0;
  const index = Math.floor(safeElapsed / AUDIT_TICKER_INTERVAL_MS) % lines.length;
  return lines[index];
}
