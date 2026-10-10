import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { ScanStatePill } from "@/components/scan-state-pill";
import type { CoverageSectionData } from "@/lib/web-audit/coverage-section-data";
import { formatDate } from "../../web-audit/_components/format";
import { LockedSubScoreTile, MiniBar, SubScoreTile } from "./coverage-tiles";
import { TrendChart } from "./trend-chart";
import { WebAuditDriveNotice } from "../web-audit-drive-notice";

/**
 * «Tu contenido frente a lo que cita la IA»: the coverage map, moved here
 * from Auditoría web (SEARCH-SEO-1 Fase 1b, log §271). It answers, topic by
 * topic, whether the site publishes something about each prompt and whether
 * the AI cites it, which is a question about citations, not about how Google
 * sees the site.
 *
 * The blocks are the ones the old screen had, with the same thresholds:
 * Evolución from 4 audits (two points draw a line that reads as a trend
 * without being one), Historial from 2. The composite «Diagnóstico general»
 * did not come along: it averaged coverage with the technical score, and the
 * technical score now has its own screen.
 *
 * Must render inside `WebAuditProvider`: the drive notice reads its state.
 */
export function CoverageSection({ data }: { data: CoverageSectionData }) {
  const {
    canAuditCoverage,
    summary,
    grouped,
    trend,
    latestMap,
    auditedScanDate,
    coverageDelta,
    surfacingDelta,
    activeCampaignProgress,
    auditPillState
  } = data;

  return (
    <section className="cov-sec" aria-labelledby="cov-sec-title">
      <div className="cov-head">
        <div>
          <div className="cit2-blk-eyebrow">Cobertura de tu web</div>
          <h2 id="cov-sec-title" className="cit2-blk-t">
            Tu contenido frente a lo que cita la IA
          </h2>
        </div>
        <div className="cov-head-r">
          {canAuditCoverage && auditPillState === "auditing" && <ScanStatePill auditing />}
          {canAuditCoverage && auditPillState === "pending" && <span className="badge">Comprobación pendiente</span>}
          {latestMap && (
            <span className="cov-date">
              Comprobada el {formatDate(latestMap.verifiedAt ?? latestMap.generatedAt)}
              {auditedScanDate ? ` · escaneo del ${formatDate(auditedScanDate)}` : ""}
            </span>
          )}
        </div>
      </div>
      <p className="cov-desc">
        Tema a tema: si tu web publica una página sobre cada uno de tus prompts, y si la IA la cita al responder.
      </p>

      <WebAuditDriveNotice />

      {/* The plan lapsed mid-campaign: the provider will not resume it, so
          this banner is the only thing explaining why it stopped. */}
      {activeCampaignProgress && !canAuditCoverage && (
        <div className="firstscan-banner">
          <div className="fb-ico">
            <Icon name="search" size={18} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="fb-t">Comprobación pausada por cambio de plan</div>
            <div className="fb-d">
              Se quedó en {activeCampaignProgress.covered} de {activeCampaignProgress.total} temas. Tu plan actual no
              incluye esta función; el progreso está guardado y se reanudará en cuanto vuelvas a un plan Pro o superior.
            </div>
          </div>
          <Link href="/dashboard/settings/billing" className="btn btn-primary btn-sm">
            Ver planes
          </Link>
        </div>
      )}

      {!canAuditCoverage && !summary ? (
        <div className="cov-tiles">
          <LockedSubScoreTile label="Contenido" hint="Temas con contenido propio verificado por la IA" />
          <LockedSubScoreTile label="Implementado" hint="Cuánto de ese contenido cita la IA en sus respuestas" />
        </div>
      ) : !summary ? (
        <div className="cit2-block cov-empty">
          Todavía no hemos comprobado tu contenido. Se comprueba sola después de los escaneos.
        </div>
      ) : (
        <>
          <div className="cov-tiles">
            <SubScoreTile
              label="Contenido"
              value={summary.coveragePct == null ? "—" : `${summary.coveredCount} / ${summary.conclusiveCount}`}
              hint="Temas con contenido propio verificado"
              delta={coverageDelta}
              pct={summary.coveragePct ?? null}
            />
            <SubScoreTile
              label="Implementado"
              value={summary.surfacingPct == null ? "—" : `${summary.surfacedCount} / ${summary.coveredCount}`}
              hint={
                summary.surfacingPct != null && grouped.invisible.length > 0
                  ? `Palanca rápida: ${grouped.invisible.length} ${grouped.invisible.length === 1 ? "tema aún sin citar" : "temas aún sin citar"}`
                  : "De tus temas con contenido, cuántos cita la IA"
              }
              delta={surfacingDelta}
              pct={summary.surfacingPct ?? null}
            />
          </div>

          {trend.length >= 4 && (
            <div className="cit2-block">
              <div className="cit2-blk-t">Evolución entre comprobaciones</div>
              <div className="cov-legend">
                <span>
                  <i style={{ background: "var(--accent)" }} />
                  Cobertura de temas
                </span>
                <span>
                  <i style={{ background: "var(--pos)" }} />
                  Tasa de implementación
                </span>
              </div>
              <TrendChart points={trend} />
            </div>
          )}

          {grouped.performing.length > 0 && (
            <div className="cit2-block">
              <div className="cit2-blk-t">Lo que ya funciona ({grouped.performing.length})</div>
              <p className="cov-note">
                Contenido propio que la IA ya cita en sus respuestas. No hay nada que hacer, sólo mantenerlo al día.
              </p>
              <ul className="cov-list">
                {grouped.performing.map((topic) => (
                  <li key={topic.promptId}>{topic.topic}</li>
                ))}
              </ul>
            </div>
          )}

          {trend.length >= 2 && (
            <div className="cit2-block">
              <div className="cit2-blk-t">Historial de comprobaciones</div>
              <p className="cov-note">Una entrada por escaneo comprobado (las 8 más recientes como máximo).</p>
              <div className="cov-history">
                {[...trend].reverse().map((point) => (
                  <div key={point.scanId} className="cov-hrow">
                    <div className="cov-hdate">{formatDate(point.generatedAt)}</div>
                    {/* A null rate renders "—" with no bar, never a 0-width
                        bar that would read as a measured 0% (WEB-AUDIT-R4). */}
                    <div className="cov-hgrid">
                      <span>Cobertura</span>
                      {point.coveragePct !== null ? <MiniBar pct={point.coveragePct} color="var(--accent)" /> : <span />}
                      <span className="cov-hv">
                        {point.coveragePct === null
                          ? "—"
                          : `${point.coveragePct}% (${point.coveredCount}/${point.conclusiveCount})`}
                      </span>
                      <span>Implementado</span>
                      {point.surfacingPct !== null ? <MiniBar pct={point.surfacingPct} color="var(--pos)" /> : <span />}
                      <span className="cov-hv">
                        {point.surfacingPct === null
                          ? "—"
                          : `${point.surfacingPct}% (${point.surfacedCount}/${point.coveredCount})`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
