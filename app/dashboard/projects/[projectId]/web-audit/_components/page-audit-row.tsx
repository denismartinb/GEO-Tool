import { Icon } from "@/components/ui/icon";
import type { PageAuditEntry } from "@/lib/web-audit/technical-audit";
import { buildPageCheckGuidance } from "@/lib/web-audit/page-checks";
import { failingPageChecks } from "@/lib/web-audit/issues";
import { buildPageFixes, type PageFixContext } from "@/lib/web-audit/page-fixes";
import { PageFixBlock } from "../page-fix-block";
import { formatDate } from "./format";
import { CheckDot } from "./issue-rows";
import { ScoreRing } from "./score-tiles";

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


export function PageAuditRow({ page, fixContext }: { page: PageAuditEntry; fixContext: PageFixContext }) {
  let path: string;
  try {
    path = new URL(page.url).pathname || "/";
  } catch {
    path = page.url;
  }

  if (page.status !== "analyzed" || !page.check) {
    const skipLabel = page.status === "analyzed" ? PAGE_SKIP_LABELS.skipped_error : PAGE_SKIP_LABELS[page.status];
    return (
      <div style={{ padding: "10px 12px", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12.5, fontWeight: 650, color: "var(--ink-3)", overflowWrap: "anywhere" }}>{path}</span>
          <span style={{ fontSize: 10.5, color: "var(--ink-4)" }}>{page.contextLabel}</span>
        </div>
        <p style={{ fontSize: 11.5, color: "var(--ink-4)", margin: "4px 0 0" }}>{skipLabel}</p>
      </div>
    );
  }

  const { check } = page;
  const guidance = buildPageCheckGuidance(check);
  // `failingPageChecks` (issues.ts) rather than re-deriving the predicates
  // here: PAGE_CHECKS stays the one definition of what "failing" means, and
  // checks never measured on this page are excluded instead of being shown
  // as broken (legacy pre-R3 snapshots).
  const fixes = buildPageFixes(failingPageChecks(check), page, fixContext);
  // Collapsed by default (WEB-AUDIT-R1): 10 pages × up to 7 guidance bullets
  // was the page's biggest wall of text. The summary row keeps the verdict
  // (score + failing-check count); the how-to-fix detail is one tap away.
  const failingCount = guidance.length;
  return (
    <details className="wa-details">
      <summary>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 12.5, fontWeight: 650, color: "var(--ink)", overflowWrap: "anywhere" }}>{path}</div>
          <div style={{ fontSize: 10.5, color: "var(--ink-4)" }}>
            {page.contextLabel}
            {failingCount > 0 ? ` · ${failingCount} ${failingCount === 1 ? "mejora pendiente" : "mejoras pendientes"}` : " · todo en orden"}
          </div>
        </div>
        {/* Lighthouse-style ring instead of a flat neutral badge (WEB-AUDIT-R4):
            same semantic thresholds as the hero gauge, so a failing page reads
            red at a glance without opening it. */}
        <ScoreRing score={check.pageScore} label={path} />
        <span className="wa-chev">
          <Icon name="chevDown" size={14} />
        </span>
      </summary>
      <div className="wa-details-body">
        {/* LEGACY SNAPSHOTS: `check` is a persisted JSONB row; a snapshot
            taken before R3 has NO indexability/citability objects and no
            metadata.ogOk (production crash 2026-07-12 on exactly this render:
            "Cannot read properties of undefined (reading 'noindex')"). The
            R3 dots render only when their sub-check was actually measured —
            an old snapshot shows the original 4 dots until re-audited (the
            "criterios ampliados" note above the cards already tells the
            founder to re-audit). Same rationale as buildPageCheckGuidance's
            legacy guards. */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <CheckDot ok={check.structuredData.pass} label="Datos estructurados" />
          <CheckDot
            ok={check.answerFormat.hasOneH1 && check.answerFormat.hasTwoH2 && check.answerFormat.hasAnswerFirstIntro}
            label="Formato respuesta-primero"
          />
          <CheckDot
            ok={check.metadata.titleOk && check.metadata.descriptionOk && check.metadata.ogOk !== false}
            label={check.metadata.ogOk === undefined ? "Metadatos" : "Metadatos + Open Graph"}
          />
          <CheckDot ok={check.freshness.status === "fresh"} label={freshnessLabel(check.freshness.status)} />
          {/* WEB-AUDIT-R3 (founder-approved 2026-07-12): indexing + citability signals. */}
          {check.indexability && (
            <>
              <CheckDot ok={!check.indexability.noindex} label="Indexable" />
              <CheckDot ok={check.indexability.canonicalOk} label="Canonical propio" />
              {/* hreflang is never shown as a hard failure elsewhere (guidance
                  text is conditional — a single-market page genuinely has none
                  to add) but the dot itself stays a simple presence signal,
                  consistent with every other dot on this row. */}
              <CheckDot ok={check.indexability.hreflangPresent} label="Hreflang" />
            </>
          )}
          {check.citability && (
            <>
              <CheckDot ok={check.citability.hasListOrTable} label="Listas o tablas" />
              <CheckDot ok={check.citability.contentOk} label="Contenido sustancial" />
            </>
          )}
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
            {guidance.map((line, i) => (
              <li key={i} style={{ display: "list-item" }}>{line}</li>
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
