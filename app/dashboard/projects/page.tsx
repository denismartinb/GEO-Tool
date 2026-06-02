import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/ui/icon";
import { archiveProject, restoreProject } from "./actions";

const successMessages: Record<string, string> = {
  project_archived: "Proyecto archivado. Puedes restaurarlo desde Proyectos archivados.",
  project_restored: "Proyecto restaurado. Ya vuelve a estar disponible en tu espacio de trabajo."
};

const errorMessages: Record<string, string> = {
  invalid_project_id: "No se pudo archivar el proyecto.",
  project_archive_failed: "No se pudo archivar el proyecto.",
  project_restore_failed: "No se pudo restaurar el proyecto.",
  project_already_archived: "Ya existe un proyecto archivado para ese dominio, país e idioma. Restáuralo para continuar.",
  project_already_active: "Ya existe un proyecto activo para ese dominio, país e idioma."
};

type Project = {
  id: string;
  name: string;
  domain: string;
  country: string;
  language: string;
  brand: string;
  is_archived: boolean;
};

function ProjectCard({ project }: { project: Project }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            {project.is_archived ? (
              <p className="font-semibold text-[var(--ink)]">{project.name}</p>
            ) : (
              <Link className="font-semibold text-[var(--ink)] hover:text-[var(--accent)]" href={`/dashboard/projects/${project.id}`}>
                {project.name}
              </Link>
            )}
            <p className="sub mt-1">{project.domain} · {project.country}/{project.language}</p>
          </div>
          <form action={project.is_archived ? restoreProject : archiveProject}>
            <input type="hidden" name="projectId" value={project.id} />
            <Button variant="outline" type="submit">
              {project.is_archived ? "Restaurar" : "Archivar"}
            </Button>
          </form>
        </div>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-3">
        <p className="sub">Marca: {project.brand}</p>
        {project.is_archived ? (
          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
            Archivado
          </span>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default async function ProjectsPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const feedback = await searchParams;
  const { supabase } = await requireUser();

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, domain, country, language, brand, is_archived, created_at")
    .order("created_at", { ascending: false });

  const activeProjects = projects?.filter((project) => !project.is_archived) ?? [];
  const archivedProjects = projects?.filter((project) => project.is_archived) ?? [];
  const successMessage = feedback.success ? successMessages[feedback.success] : null;
  const errorMessage = feedback.error ? errorMessages[feedback.error] : null;

  return (
    <div className="page space-y-5">
      <p className="kicker">Espacio de trabajo</p>
      <div className="flex items-center justify-between gap-3">
        <h1 className="title-lg">Proyectos</h1>
        <Link href="/dashboard/projects/new">
          <Button><Icon name="play" size={14} />Nuevo proyecto</Button>
        </Link>
      </div>

      {successMessage ? <p className="feedback success">{successMessage}</p> : null}
      {errorMessage ? <p className="feedback error">{errorMessage}</p> : null}

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--ink)]">Proyectos activos</h2>
          <p className="sub mt-1">Proyectos disponibles en tu navegación de trabajo.</p>
        </div>
        {!activeProjects.length ? (
          <div className="space-y-3">
            <EmptyState title="Todavía no hay proyectos activos" description="Crea un nuevo proyecto GEO para empezar." />
            {archivedProjects.length ? (
              <p className="text-sm text-[var(--ink-2)]">Tienes proyectos archivados que puedes restaurar.</p>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-3">
            {activeProjects.map((project) => <ProjectCard key={project.id} project={project} />)}
          </div>
        )}
      </section>

      <section className="space-y-3 pt-2">
        <div>
          <h2 className="text-lg font-semibold text-[var(--ink)]">Proyectos archivados</h2>
          <p className="sub mt-1">Puedes restaurarlos sin perder su configuración ni sus escaneos.</p>
        </div>
        {!archivedProjects.length ? (
          <EmptyState title="No hay proyectos archivados" description="Los proyectos que archives aparecerán aquí para poder restaurarlos." />
        ) : (
          <div className="grid gap-3">
            {archivedProjects.map((project) => <ProjectCard key={project.id} project={project} />)}
          </div>
        )}
      </section>
    </div>
  );
}
