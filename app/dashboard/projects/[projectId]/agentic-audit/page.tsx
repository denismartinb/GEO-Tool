import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { AGENTIC_REVIEW_DAILY_LIMIT, readAgenticAudits } from "@/lib/agentic-audit/console-audit";
import { isProOrAbove, resolveSystemPlanId, SYSTEM_PLAN_COLUMNS } from "@/lib/billing";
import { requireActiveProject } from "@/lib/project-workspace";
import { projectScreenMetadata } from "@/lib/seo/console-metadata";
import { AgenticAuditForm, AgenticAuditScreen } from "./_components/agentic-audit-screen";

/**
 * «Auditoría agéntica» — AGENTIC-COMMERCE-1 Fase 2a (log §322, ADR 0043),
 * design in docs/design-reference/agentic-commerce-1/fase-2a.html. The same
 * engine as the free checker on /comercio-agentico, run on one product page
 * the customer saves, with the last review kept (migration 0043). No LLM.
 *
 * Pro, Agencia and the Pro trial. Starter sees the screen with the invitation
 * to move to Pro. Without the migration the screen says it is not available
 * yet, never an error.
 */

export const dynamic = "force-dynamic";
// «Revisar ahora» runs inside this page's function: the engine has a 20 s budget.
export const maxDuration = 30;

export async function generateMetadata({ params }: { params: Promise<{ projectId: string }> }): Promise<Metadata> {
  const { projectId } = await params;
  return projectScreenMetadata("Auditoría agéntica", async () => (await requireActiveProject(projectId)).domain);
}

const TIME_ZONE = "Europe/Madrid";

function reviewedLabel(iso: string, now: Date): string {
  const at = new Date(iso);
  const day = (d: Date) => d.toLocaleDateString("es-ES", { timeZone: TIME_ZONE });
  const time = at.toLocaleTimeString("es-ES", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit" });
  if (day(at) === day(now)) return `Revisada hoy a las ${time}.`;
  const date = at.toLocaleDateString("es-ES", { timeZone: TIME_ZONE, day: "numeric", month: "long" });
  return `Revisada el ${date} a las ${time}.`;
}

export default async function AgenticAuditPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await requireActiveProject(projectId);
  const { supabase, user } = await requireUser();

  const [{ data: profile }, audits] = await Promise.all([
    supabase.from("profiles").select(SYSTEM_PLAN_COLUMNS).eq("id", user.id).maybeSingle(),
    readAgenticAudits(supabase, projectId, user.id)
  ]);
  const canRun = isProOrAbove(resolveSystemPlanId(profile as Parameters<typeof resolveSystemPlanId>[0]));
  // Only a review of the saved page is shown: after «Cambiar» to a page whose review failed, the old result would mislead.
  const shown = audits.available && audits.latest && audits.latest.url === audits.savedUrl ? audits.latest : null;

  return (
    <div className="page">
      <div className="ov-sticky-header">
        <div className="ov-sticky-left">
          <div>
            <p className="kicker" style={{ marginBottom: 2 }}>Auditoría agéntica</p>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 750, color: "var(--ink)", letterSpacing: "-.01em" }}>
                {project.name}
              </span>
              <span className="badge badge-neutral" style={{ fontFamily: "var(--mono)", fontSize: 11 }}>
                {project.domain}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="ag-page">
        <div className="ag-screen">
          <p className="ag-intro">Si un agente de IA puede encontrar tu tienda, entender tus productos, fiarse y llegar al pago.</p>

          {!canRun ? (
            <div className="card ag-upsell">
              <h3>La auditoría agéntica está en Pro y Agencia</h3>
              <p>
                Revisa una ficha de tu tienda como la leería un agente de IA: si puede entrar, si entiende el producto, si puede
                fiarse y si llega al pago, con lo que más sube tu nota.
              </p>
              <Link className="btn btn-primary" href="/dashboard/settings?openPlan=pro#plan">
                Pasar a Pro
              </Link>
            </div>
          ) : !audits.available ? (
            <div className="card">
              <h2 className="ag-h">Muy pronto podrás revisar tu tienda aquí</h2>
              <p className="ag-muted">
                Estamos terminando de activar la auditoría agéntica. Mientras tanto puedes hacer una comprobación rápida en{" "}
                <Link href="/comercio-agentico">la página de comercio agéntico</Link>.
              </p>
            </div>
          ) : audits.savedUrl === null ? (
            <AgenticAuditForm projectId={projectId} domain={project.domain} />
          ) : (
            <AgenticAuditScreen
              projectId={projectId}
              savedUrl={audits.savedUrl}
              reviewedLabel={shown ? reviewedLabel(shown.createdAt, new Date()) : null}
              result={shown?.result ?? null}
              remaining={Math.max(0, AGENTIC_REVIEW_DAILY_LIMIT - audits.usedToday)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
