import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import type { CoverageSectionData } from "@/lib/web-audit/coverage-section-data";
import { formatDate } from "./format";
import { MiniBar } from "./coverage-tiles";
import { WebAuditDriveNotice } from "../web-audit-drive-notice";

/**
 * What is left of «Cobertura de tu contenido» after the founder removed the
 * card (tiles Contenido / Implementado and «Evolución entre comprobaciones»,
 * 2026-11-02, log §452). Only the two recovery messages stay, without a card
 * around them, because they are the only place that explains why the coverage
 * check stopped: the driver's error and the plan that lapsed mid-campaign.
 * Both render nothing in the normal case.
 *
 * Must render inside `WebAuditProvider`: the drive notice reads its state.
 */
export function CoverageNotices({ data }: { data: CoverageSectionData }) {
  const { canAuditCoverage, activeCampaignProgress } = data;
  return (
    <>
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
              Se quedó en {activeCampaignProgress.covered} de{" "}
              {activeCampaignProgress.total} temas. Tu plan actual no incluye
              esta función; el progreso está guardado y se reanudará en cuanto
              vuelvas a un plan Pro o superior.
            </div>
          </div>
          <Link
            href="/dashboard/settings/billing"
            className="btn btn-primary btn-sm"
          >
            Ver planes
          </Link>
        </div>
      )}
    </>
  );
}

/**
 * «Historial de comprobaciones», at the foot of the Auditoría GEO block
 * (founder, 2026-10-30): one entry per checked scan, from 2 audits. It used to
 * sit inside the coverage card's disclosure, far from anything that needs it.
 */
export function CoverageHistory({ data }: { data: CoverageSectionData }) {
  const { summary, trend } = data;
  if (!summary || trend.length < 2) return null;
  return (
    <section className="card cov-sec cov-hist" aria-labelledby="cov-hist-title">
      <details className="cov-blk cov-hist-d">
        <summary id="cov-hist-title" className="cov-blk-t">
          Historial de comprobaciones
        </summary>
        <p className="cov-note">
          Una entrada por escaneo comprobado (las 8 más recientes como máximo).
        </p>
        <div className="cov-history">
          {[...trend].reverse().map((point) => (
            <div key={point.scanId} className="cov-hrow">
              <div className="cov-hdate">{formatDate(point.generatedAt)}</div>
              {/* A null rate renders "—" with no bar, never a 0-width
                        bar that would read as a measured 0% (WEB-AUDIT-R4). */}
              <div className="cov-hgrid">
                <span>Cobertura</span>
                {point.coveragePct !== null ? (
                  <MiniBar pct={point.coveragePct} color="var(--accent)" />
                ) : (
                  <span />
                )}
                <span className="cov-hv">
                  {point.coveragePct === null
                    ? "—"
                    : `${point.coveragePct}% (${point.coveredCount}/${point.conclusiveCount})`}
                </span>
                <span>Implementado</span>
                {point.surfacingPct !== null ? (
                  <MiniBar pct={point.surfacingPct} color="var(--pos)" />
                ) : (
                  <span />
                )}
                <span className="cov-hv">
                  {point.surfacingPct === null
                    ? "—"
                    : `${point.surfacingPct}% (${point.surfacedCount}/${point.coveredCount})`}
                </span>
              </div>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}
