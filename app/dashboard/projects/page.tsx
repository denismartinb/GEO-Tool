import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { archiveProject } from "./actions";

export default async function ProjectsPage() {
  const { supabase } = await requireUser();

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, domain, country, language, brand, created_at")
    .eq("is_archived", false)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <Link href="/dashboard/projects/new">
          <Button>New project</Button>
        </Link>
      </div>

      {!projects?.length ? (
        <EmptyState title="No projects yet" description="Create your first GEO project to get started." />
      ) : (
        <div className="grid gap-3">
          {projects.map((project) => (
            <Card key={project.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Link className="font-medium underline" href={`/dashboard/projects/${project.id}`}>
                      {project.name}
                    </Link>
                    <p className="text-sm text-slate-600">{project.domain} · {project.country}/{project.language}</p>
                  </div>
                  <form action={archiveProject}>
                    <input type="hidden" name="projectId" value={project.id} />
                    <Button variant="outline" type="submit">Archive</Button>
                  </form>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-600">Brand: {project.brand}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
