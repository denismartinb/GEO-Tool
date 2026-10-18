import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import {
  AGENTIC_REVIEW_DAILY_LIMIT,
  AGENTIC_SCREEN_MIN_GAP_MS,
  readAgenticAudits,
  shouldAutoReview
} from "@/lib/agentic-audit/console-audit";
import { isProOrAbove, resolveSystemPlanId, SYSTEM_PLAN_COLUMNS } from "@/lib/billing";
import { requireActiveProject } from "@/lib/project-workspace";
import { projectScreenMetadata } from "@/lib/seo/console-metadata";
import { AgenticTabs } from "../_components/agentic-tabs";
import {
  AgenticAuditScreen,
  AgenticAuditSearching,
  AgenticAuditUnreachable
} from "./_components/agentic-audit-screen";

/**
 * «Auditoría agéntica» — AGENTIC-COMMERCE-1 Fase 2a (log §322, §323, ADR
 * 0043), design in docs/design-reference/agentic-commerce-1/fase-2a-auto.html.
 * The same engine as the free checker on /comercio-agentico, run by itself
 * after each scan on a product page it finds in the store, with the last
 * review kept (migration 0043). No LLM, and nobody pastes a URL: the first
 * visit starts the review if there is none (or it is stale). A review that
 * found nothing to sell is started again on every visit, behind the search
 * scene instead of the old «No hemos encontrado qué vendes» (log §325).
 *
 * Pro, Agencia and the Pro trial. Starter sees the screen with the invitation
 * to move to Pro. Without the migration the screen says it is not available
 * yet, never an error.
 */

export const dynamic = "force-dynamic";
// The automatic review runs inside this page's function: the engine has a 24 s
// budget (AGENTIC_DISCOVER_BUDGET_MS) plus its reads and writes.
export const maxDuration = 40;

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
  if (day(at) === day(new Date(now.getTime() - 24 * 60 * 60 * 1000))) return `Revisada ayer a las ${time}.`;
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
  const now = Date.now();
  const autoReview = audits.available && shouldAutoReview(audits, now);
  const inFlight =
    audits.available &&
    audits.lastAttempt?.status === "pending" &&
    now - Date.parse(audits.lastAttempt.createdAt) < AGENTIC_SCREEN_MIN_GAP_MS;
  const remaining = audits.available ? Math.max(0, AGENTIC_REVIEW_DAILY_LIMIT - audits.usedToday) : 0;

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
          <AgenticTabs projectId={projectId} current="audit" />
          <p className="ag-intro">Si un agente de IA puede encontrar tu web, entender lo que vendes, fiarse y llegar a comprar o reservar.</p>

          {!canRun ? (
            <div className="card ag-upsell">
              <h3>La auditoría agéntica está en Pro y Agencia</h3>
              <p>
                Revisa la página donde vendes como la leería un agente de IA: si puede entrar, si entiende lo que vendes, si
                puede fiarse y si llega a comprar o reservar, con lo que más sube tu nota.
              </p>
              <Link className="btn btn-primary" href="/dashboard/settings?openPlan=pro#plan">
                Pasar a Pro
              </Link>
            </div>
          ) : !audits.available ? (
            <div className="card">
              <h2 className="ag-h">Muy pronto podrás revisar tu web aquí</h2>
              <p className="ag-muted">
                Estamos terminando de activar la auditoría agéntica. Mientras tanto puedes hacer una comprobación rápida en{" "}
                <Link href="/comercio-agentico">la página de comercio agéntico</Link>.
              </p>
            </div>
          ) : audits.latest && !(autoReview && audits.latest.result.found === "none") ? (
            <AgenticAuditScreen
              projectId={projectId}
              reviewedLabel={reviewedLabel(audits.latest.createdAt, new Date(now))}
              result={audits.latest.result}
              remaining={remaining}
              refresh={autoReview}
            />
          ) : autoReview || inFlight ? (
            <AgenticAuditSearching projectId={projectId} />
          ) : (
            <AgenticAuditUnreachable projectId={projectId} domain={project.domain} remaining={remaining} />
          )}
        </div>
      </div>
    </div>
  );
}
