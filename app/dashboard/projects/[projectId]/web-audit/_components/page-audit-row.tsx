import { Icon } from "@/components/ui/icon";
import type { PageAuditEntry } from "@/lib/web-audit/technical-audit";
import { buildKeyedPageCheckGuidance } from "@/lib/web-audit/page-checks";
import { pageCheckStates } from "@/lib/web-audit/issues";
import { AUDIT_BLOCKS, pageBlockScore, type AuditBlockKey } from "@/lib/web-audit/audit-blocks";
import { ISSUE_CHECK_META } from "@/lib/web-audit/issue-labels";
import { buildPageFixes, type PageFixContext } from "@/lib/web-audit/page-fixes";
import { PageFixBlock } from "../page-fix-block";
import { formatDate } from "./format";
import { CheckDot } from "./issue-rows";
import { scoreColor } from "./score-tiles";

/**
 * PRELAUNCH-HARDENING-1 Fase R7 — un trozo de la pantalla de Auditoría web.
 *
 * `page.tsx` tenía 1.933 líneas con catorce componentes de presentación
 * definidos dentro, así que para cambiar una fila había que navegar la página
 * entera. Son todos componentes de servidor y puros: reciben datos ya
 * calculados y devuelven marcado. Cero cambios de lógica y cero cambios de
 * marcado — el `ux-pilot` es quien lo verifica, porque esta fase SÍ toca UI
 * (log §83).
 */

const PAGE_SKIP_LABELS: Record<Exclude<PageAuditEntry["status"], "analyzed">, string> = {
  skipped_offsite: "Descartada: fuera del dominio verificado",
  // Distinct from skipped_offsite (WEB-AUDIT-2 bug report, 2026-07-11): a page
  // whose hostname genuinely IS the audited domain but whose DNS resolution
  // couldn't be verified safe (lookup error/timeout, or a resolved private
  // address) — never the same thing as "not your domain". Check the Vercel
  // function logs (lib/web-audit/fetch-page.ts's dns_lookup_failed /
  // dns_resolved_unsafe_ip lines) for the actual reason.
  skipped_unsafe_ip: "Descartada: no se ha podido verificar de forma segura la IP de este dominio",
  skipped_not_html: "Descartada: la respuesta no es HTML",
  skipped_timeout: "Descartada: tiempo de carga agotado",
  skipped_error: "Descartada: no se ha podido cargar",
  skipped_budget: "Sin comprobar: límite de tiempo de la auditoría"
};

export function freshnessLabel(status: "fresh" | "aging" | "stale" | "unknown"): string {
  switch (status) {
    case "fresh":
      return "Actualizada";
    case "aging":
      return "Empieza a desactualizarse";
    case "stale":
      return "Desactualizada";
    default:
      return "Sin fecha detectada";
  }
}


/**
 * One page in a block's Páginas tab (log §274): its score within that block,
 * and only that block's checks, guidance and copyable fixes. The same page
 * appears in both blocks with two different numbers, which is the point.
 */
export function PageAuditRow({
  page,
  fixContext,
  block
}: {
  page: PageAuditEntry;
  fixContext: PageFixContext;
  block: AuditBlockKey;
}) {
  let path: string;
  try {
    path = new URL(page.url).pathname || "/";
  } catch {
    path = page.url;
  }

  if (page.status !== "analyzed" || !page.check) {
    const skipLabel = page.status === "analyzed" ? PAGE_SKIP_LABELS.skipped_error : PAGE_SKIP_LABELS[page.status];
    return (
      <div className="sa-pg sa-pg-skipped">
        <div className="sa-pg-n">
          <code>{path}</code>
          <span>
            {page.contextLabel} · {skipLabel}
          </span>
        </div>
      </div>
    );
  }

  const { check } = page;
  const inBlock = new Set(AUDIT_BLOCKS[block].checks);
  // `pageCheckStates` (issues.ts) rather than re-deriving the predicates
  // here: PAGE_CHECKS stays the one definition of what "failing" means, and
  // checks never measured on this page are left out instead of being shown
  // as broken (legacy pre-R3 snapshots have no indexability/citability; the
  // production crash of 2026-07-12 was reading them unguarded).
  const states = pageCheckStates(check).filter((state) => inBlock.has(state.check));
  const failing = states.filter((state) => state.fails).map((state) => state.check);
  const guidance = buildKeyedPageCheckGuidance(check).filter((g) => inBlock.has(g.check));
  const fixes = buildPageFixes(failing, page, fixContext);
  const score = pageBlockScore(check, block);
  // Collapsed by default (WEB-AUDIT-R1): the summary keeps the verdict, the
  // how-to-fix detail is one tap away.
  const failingCount = failing.length;
  return (
    <details className="wa-details sa-pg">
      <summary>
        <div className="sa-pg-n">
          <code>{path}</code>
          <span>
            {page.contextLabel}
            {failingCount > 0 ? ` · ${failingCount} ${failingCount === 1 ? "mejora pendiente" : "mejoras pendientes"}` : " · todo en orden"}
          </span>
        </div>
        {score === null ? (
          <span className="sa-pg-na">Sin medir</span>
        ) : (
          <>
            <div
              className="sa-track sa-pg-track"
              role="img"
              aria-label={`Nota ${block === "geo" ? "GEO" : "SEO"} de ${path}: ${score} de 100`}
            >
              <div className="sa-fill" style={{ width: `${score}%`, background: scoreColor(score) }} />
            </div>
            <span className="sa-cat-v">{score}</span>
          </>
        )}
        <span className="wa-chev">
          <Icon name="chevDown" size={14} />
        </span>
      </summary>
      <div className="wa-details-body">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {states.map((state) => (
            <CheckDot
              key={state.check}
              ok={!state.fails}
              label={state.check === "freshness" ? freshnessLabel(check.freshness.status) : ISSUE_CHECK_META[state.check].label}
            />
          ))}
        </div>
        {/* `!= null` (loose), not `!== null`: legacy PageAuditEntry rows lack
            fetchMs/htmlBytes entirely (undefined), which `!== null` would let
            through as "Tiempo de respuesta: undefined ms". */}
        {(page.fetchMs != null || page.htmlBytes != null) && (
          <p style={{ fontSize: 10.5, color: "var(--ink-4)", margin: "8px 0 0" }}>
            {page.fetchMs != null && `Tiempo de respuesta: ${page.fetchMs} ms`}
            {page.fetchMs != null && page.htmlBytes != null && " · "}
            {page.htmlBytes != null && `Tamaño HTML: ${(page.htmlBytes / 1024).toFixed(1)} KB`}
          </p>
        )}
        {/* Deterministic "qué hacer" per failing sub-check (no LLM — see
            buildPageCheckGuidance), reviewed with geo-strategy 2026-07-11:
            founder report was that seeing red X's with no explanation left no
            idea what to actually do. An AI-generated draft (rewritten title/
            description/intro) is a separate, larger feature explicitly parked
            for its own Task Intake — this is only the deterministic half. */}
        {guidance.length > 0 && (
          <ul
            style={{
              fontSize: 11.5,
              color: "var(--ink-3)",
              lineHeight: 1.5,
              margin: "8px 0 0",
              paddingLeft: 18,
              listStyleType: "disc",
              listStylePosition: "outside",
              display: "flex",
              flexDirection: "column",
              gap: 4
            }}
          >
            {guidance.map((g, i) => (
              <li key={i} style={{ display: "list-item" }}>{g.line}</li>
            ))}
          </ul>
        )}
        {/* Fase 3b: the copyable fix for each failing check that HAS one.
            Founder review 2026-08-03: "en páginas está muy bien, pero no
            damos una solución para mejorar la puntuación de cada página" —
            the prose above says what to change, these say it in code you can
            paste. Deliberately after the guidance, not instead of it: several
            checks (h1, intro, listas, extensión) are edits to the page's own
            content and correctly produce no snippet at all. */}
        {fixes.length > 0 && (
          <div className="wa2-fixes">
            {fixes.map((fix) => (
              <PageFixBlock key={fix.check} fix={fix} />
            ))}
          </div>
        )}
      </div>
    </details>
  );
}

/**
 * Cómo se lee un sitemap, ahora que lo parseamos.
 *
 * `bots.sitemap` es opcional: los snapshots anteriores a WEB-AUDIT-SITEMAP-1
 * sólo tienen `sitemapFound`, así que ahí se conserva exactamente el texto de
 * antes. Nada se recalcula sobre un snapshot viejo — sería inventar un dato
 * que aquella auditoría nunca midió.
 *
 * El recuento sólo se muestra como cifra cuando el fichero cabía entero. Si
 * vino truncado por el tope de 128 KB, es un suelo y se dice "más de N": dar
 * el prefijo como total sería una métrica fabricada.
 */
