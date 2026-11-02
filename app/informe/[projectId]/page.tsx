import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import localFont from "next/font/local";
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
 * Its own copy of the console's two fonts with the weights the Instrumento
 * look uses (Figtree from 300 for the big figures, JetBrains Mono for labels;
 * REPORT-INSTRUMENTO-1, log §439): the root layout loads fewer, and widening
 * those would change the weight of text across the whole site.
 *
 * STATIC instances, one file per weight (latin subset), never the variable
 * font: Chrome embeds a variable font in a printed PDF as Type 3 glyphs,
 * which the iOS PDF viewer paints stroke by stroke, so the cover flickered on
 * open (founder, 2026-11-02). Static files embed as plain TrueType.
 */

const reportMono = localFont({
  src: [
    { path: "../fonts/jbmono-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/jbmono-500.woff2", weight: "500", style: "normal" },
    { path: "../fonts/jbmono-600.woff2", weight: "600", style: "normal" }
  ],
  variable: "--gr-font-mono",
  display: "block"
});

const reportBody = localFont({
  src: [
    { path: "../fonts/figtree-300.woff2", weight: "300", style: "normal" },
    { path: "../fonts/figtree-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/figtree-500.woff2", weight: "500", style: "normal" },
    { path: "../fonts/figtree-600.woff2", weight: "600", style: "normal" },
    { path: "../fonts/figtree-700.woff2", weight: "700", style: "normal" },
    { path: "../fonts/figtree-800.woff2", weight: "800", style: "normal" }
  ],
  variable: "--gr-font-body",
  display: "block"
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
      <GeoReport model={model} fontClassName={`${reportMono.variable} ${reportBody.variable}`} />
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
