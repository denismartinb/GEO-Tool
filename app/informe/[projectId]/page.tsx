import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import { requireUser } from "@/lib/auth";
import { getPlanForUser } from "@/lib/billing";
import { loadReportInput } from "@/lib/report/report-data";
import { buildReportModel } from "@/lib/report/report-model";
import { projectScreenTitle } from "@/lib/seo/console-metadata";
import { GeoReport } from "@/components/report/geo-report";
import { ReportToolbar } from "@/components/report/report-toolbar";

/**
 * GEO-REPORT-1 Fase 2 — the GenScore report of a project's latest scan, at
 * its own address and outside the console layout, so nothing of the console
 * (sidebar, fixed header, scroll container) sits around the printed pages.
 * "Descargar informe" in Visión general and Recomendaciones opens it.
 *
 * Its own copy of the two brand fonts with the weights the approved design
 * uses (Figtree up to 800, Bricolage from 600): the root layout loads fewer,
 * and widening those would change the weight of text across the whole site.
 */

const reportDisplay = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--gr-font-display",
  display: "swap"
});

const reportBody = Figtree({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--gr-font-body",
  display: "swap"
});

type Params = { params: Promise<{ projectId: string }> };

async function loadProject(projectId: string) {
  const { supabase, user } = await requireUser();
  const { data: project } = await supabase
    .from("projects")
    .select("id, name, brand, domain")
    .eq("id", projectId)
    .eq("is_archived", false)
    .maybeSingle();
  if (!project) notFound();
  return { supabase, user, project: project as { id: string; name: string; brand: string | null; domain: string } };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { projectId } = await params;
  const { project } = await loadProject(projectId);
  return { title: projectScreenTitle("Informe", project.domain) };
}

export default async function ReportPage({ params }: Params) {
  const { projectId } = await params;
  const { supabase, user, project } = await loadProject(projectId);
  const backHref = `/dashboard/projects/${projectId}`;

  // Paid plans and the trial (Task Intake decision 4). `free` is an account
  // with no plan, read-only since TRIAL-ONLY-1 (log §243).
  const plan = await getPlanForUser(supabase, user.id);
  if (plan.id === "free") {
    return (
      <ReportNotice
        backHref={backHref}
        title="El informe es parte de los planes de GenScore"
        action={{ href: "/dashboard/settings?openPlan=pro", label: "Elegir plan" }}
      >
        Elige un plan para descargar el informe de {project.domain} con los datos de tu último escaneo.
      </ReportNotice>
    );
  }

  const input = await loadReportInput({ supabase, project });
  const model = input ? buildReportModel(input) : null;
  if (!model) {
    return (
      <ReportNotice backHref={backHref} title="Todavía no hay informe">
        El informe sale de tu último escaneo completado de {project.domain}. Cuando termine el primero, lo tendrás aquí.
      </ReportNotice>
    );
  }

  return (
    <>
      <ReportToolbar backHref={backHref} />
      <GeoReport model={model} fontClassName={`${reportDisplay.variable} ${reportBody.variable}`} />
    </>
  );
}

function ReportNotice({
  backHref,
  title,
  action,
  children
}: {
  backHref: string;
  title: string;
  action?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <main className="gr-notice">
      <h1>{title}</h1>
      <p>{children}</p>
      {action ? (
        <Link href={action.href} className="gr-notice-action">
          {action.label}
        </Link>
      ) : null}
      <Link href={backHref}>← Volver a la consola</Link>
    </main>
  );
}
