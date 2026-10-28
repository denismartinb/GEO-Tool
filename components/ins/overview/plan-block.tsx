import Link from "next/link";
import { Suspense } from "react";
import type { AuthenticatedContext } from "@/lib/auth";
import { Ic } from "@/components/ins/ic";
import { Roll } from "@/components/ins/kit/roll";
import { HiPath } from "./blocks";
import type { OverviewPlan, PlanRow } from "@/lib/ins/overview-plan";
import { loadGoogleRecs } from "@/app/dashboard/projects/[projectId]/recommendations/_components/google-recs";
import { pickPlanRec, planCopy, planGoal } from "@/app/dashboard/projects/[projectId]/recommendations/_components/google-rec-copy";

/**
 * «Tu plan de esta semana», option 1 «Hoja» of the approved design (Denis,
 * 2026-10-26). The actions, their order and the ceiling are the ones of
 * Recomendaciones (`buildOverviewPlan`); with Search Console connected the
 * strongest Google card takes the second slot, as there (RECS-ONE-QUEUE-1,
 * log §307), and the block waits for Google behind its own skeleton.
 */

const COUNT_WORD: Record<number, string> = { 1: "esta acción", 2: "estas dos acciones", 3: "estas tres acciones" };

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function Row({ row, index, href }: { row: PlanRow; index: number; href: string }) {
  return (
    <li>
      <Link href={href}>
        <span className="pv-n num">{pad(index + 1)}</span>
        <span className="pv-t">
          <HiPath text={row.text} />
          <span className="pv-m">
            <span className={`pv-src${row.source === "google" ? " google" : ""}`}>{row.source === "google" ? "Google" : "IA"}</span>
          </span>
        </span>
        {row.points !== null ? (
          <span className="pv-pt num">+{row.points} pt</span>
        ) : (
          <span className="pv-pt q">{row.qualitative}</span>
        )}
      </Link>
    </li>
  );
}

export function PlanView({
  projectId,
  rows,
  points,
  subtitle
}: {
  projectId: string;
  rows: PlanRow[];
  points: number | null;
  subtitle: string;
}) {
  const href = `/dashboard/projects/${projectId}/recommendations`;
  return (
    <section className="sec" aria-label="Tu plan de esta semana">
      <div className="pv pv1">
        <div className="pv-l">
          <div className="pv-ey">Tu plan de esta semana</div>
          <div className="pv-big num">
            {points !== null ? (
              <>
                +<Roll value={points} />
                <small>pt</small>
              </>
            ) : (
              <>
                <Roll value={rows.length} />
                <small>{rows.length === 1 ? "acción" : "acciones"}</small>
              </>
            )}
          </div>
          <p className="pv-s">{subtitle}</p>
          <Link className="btn line" href={href}>
            Ver recomendaciones
            <Ic n="arrowr" sm />
          </Link>
        </div>
        <ol className="pv-list">
          {rows.map((r, i) => (
            <Row key={r.id} row={r} index={i} href={href} />
          ))}
        </ol>
      </div>
    </section>
  );
}

function PlanSkeleton() {
  return (
    <section className="sec" aria-label="Tu plan de esta semana" aria-busy="true">
      <div className="pv pv1">
        <div className="pv-l">
          <div className="pv-ey">Tu plan de esta semana</div>
          <div className="pv-big num ins-skel-line" style={{ width: 150, height: 70 }} />
          <span className="ins-skel-line" style={{ width: "80%", height: 14 }} />
        </div>
        <ol className="pv-list" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <li key={i}>
              <span style={{ display: "block", padding: "18px 4px" }}>
                <span className="ins-skel-line" style={{ width: `${88 - i * 12}%`, height: 14 }} />
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function aiSubtitle(plan: OverviewPlan): string {
  if (plan.points !== null) {
    return `Lo que puede subir tu Puntuación GEO si haces ${COUNT_WORD[plan.rows.length] ?? "estas acciones"}.`;
  }
  return "Ordenadas por su impacto en tu visibilidad en las respuestas de IA.";
}

type GoogleProps = {
  projectId: string;
  ownerUserId: string;
  domain: string;
  supabase: AuthenticatedContext["supabase"];
};

async function PlanWithGoogle({ plan, google }: { plan: OverviewPlan; google: GoogleProps }) {
  const data = await loadGoogleRecs(google.projectId, google.ownerUserId, google.domain, google.supabase);
  const card = data ? pickPlanRec(data.recs) : null;
  if (!card) {
    return <PlanView projectId={google.projectId} rows={plan.rows} points={plan.points} subtitle={aiSubtitle(plan)} />;
  }
  const copy = planCopy(card);
  const googleRow: PlanRow = {
    id: `google:${card.kind}:${card.query}`,
    text: copy.title,
    source: "google",
    points: null,
    qualitative: copy.kind
  };
  const ai = plan.rows.slice(0, 2);
  const at = Math.min(1, ai.length);
  const rows = [...ai.slice(0, at), googleRow, ...ai.slice(at)];
  const goal = planGoal(card.kind);
  const subtitle =
    plan.pointsWithGoogle !== null
      ? `Hasta +${plan.pointsWithGoogle} pt en tu Puntuación GEO con las acciones de IA, y ${goal}.`
      : `${goal.charAt(0).toUpperCase()}${goal.slice(1)}.`;
  return <PlanView projectId={google.projectId} rows={rows} points={plan.pointsWithGoogle} subtitle={subtitle} />;
}

/** The plan block. Without Search Console the AI plan renders at once. */
export function PlanBlock({
  projectId,
  plan,
  google
}: {
  projectId: string;
  plan: OverviewPlan;
  google: GoogleProps | null;
}) {
  if (!google) {
    return <PlanView projectId={projectId} rows={plan.rows} points={plan.points} subtitle={aiSubtitle(plan)} />;
  }
  return (
    <Suspense fallback={<PlanSkeleton />}>
      <PlanWithGoogle plan={plan} google={google} />
    </Suspense>
  );
}
