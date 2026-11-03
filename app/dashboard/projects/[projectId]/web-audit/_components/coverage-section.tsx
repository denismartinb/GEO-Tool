import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import type { CoverageSectionData } from "@/lib/web-audit/coverage-section-data";
import { WebAuditDriveNotice } from "../web-audit-drive-notice";

/**
 * What is left of «Cobertura de tu contenido» after the founder removed the
 * card (tiles Contenido / Implementado and «Evolución entre comprobaciones»)
 * and «Historial de comprobaciones» (2026-11-02/03, log §453). Only the two
 * recovery messages stay, without a card around them, because they are the only place that explains why the coverage
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
