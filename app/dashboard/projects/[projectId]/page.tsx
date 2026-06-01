import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/empty-state";
import {
  createCompetitor,
  createPrompt,
  deactivateCompetitor,
  deactivatePrompt,
  startScan,
  updateCompetitor,
  updatePrompt
} from "./actions";

export default async function ProjectDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { projectId } = await params;
  const feedback = await searchParams;
  const { supabase } = await requireUser();

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, domain, brand, country, language, created_at")
    .eq("id", projectId)
    .eq("is_archived", false)
    .single();

  if (!project) notFound();

  const [{ data: prompts }, { data: competitors }, { data: runs }] = await Promise.all([
    supabase
      .from("project_prompts")
      .select("id, prompt_text, category, is_active")
      .eq("project_id", projectId)
      .eq("is_active", true)
      .order("created_at", { ascending: false }),
    supabase
      .from("project_competitors")
      .select("id, name, domain, is_active")
      .eq("project_id", projectId)
      .eq("is_active", true)
      .order("created_at", { ascending: false }),
    supabase
      .from("scan_runs")
      .select("id, status, total_prompts, successful_prompts, failed_prompts, created_at, started_at, finished_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
  ]);

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold">{project.name}</h1>
        <p className="text-sm text-slate-600">
          {project.domain} · {project.country}/{project.language} · Brand: {project.brand}
        </p>
      </section>

      <section>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <h2 className="font-medium">Overview</h2>
              <form action={startScan}>
                <input type="hidden" name="projectId" value={projectId} />
                <Button type="submit">Run scan</Button>
              </form>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-slate-600">
              This phase creates scan runs and jobs only. Prompt execution will be implemented next.
            </p>
            {feedback.error ? <p className="text-sm text-red-600">{feedback.error}</p> : null}
            {feedback.success ? <p className="text-sm text-green-700">{feedback.success}</p> : null}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><h2 className="font-medium">Prompts</h2></CardHeader>
          <CardContent className="space-y-4">
            <form action={createPrompt} className="space-y-2 rounded border p-3">
              <input type="hidden" name="projectId" value={projectId} />
              <div>
                <Label htmlFor="promptText">Prompt</Label>
                <Textarea id="promptText" name="promptText" required rows={3} />
              </div>
              <div>
                <Label htmlFor="category">Category</Label>
                <Input id="category" name="category" />
              </div>
              <Button type="submit">Add prompt</Button>
            </form>

            {!prompts?.length ? (
              <EmptyState title="No active prompts" description="Add 5-10 prompts to prepare future scans." />
            ) : (
              <div className="space-y-3">
                {prompts.map((prompt) => (
                  <form key={prompt.id} action={updatePrompt} className="space-y-2 rounded border p-3">
                    <input type="hidden" name="projectId" value={projectId} />
                    <input type="hidden" name="promptId" value={prompt.id} />
                    <Textarea name="promptText" defaultValue={prompt.prompt_text} rows={3} required />
                    <Input name="category" defaultValue={prompt.category ?? ""} placeholder="Category" />
                    <div className="flex gap-2">
                      <Button type="submit" variant="outline">Save</Button>
                      <button
                        formAction={deactivatePrompt}
                        className="inline-flex h-9 items-center rounded-md border border-slate-300 px-3 text-sm hover:bg-slate-100"
                        type="submit"
                      >
                        Deactivate
                      </button>
                    </div>
                  </form>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><h2 className="font-medium">Competitors</h2></CardHeader>
          <CardContent className="space-y-4">
            <form action={createCompetitor} className="space-y-2 rounded border p-3">
              <input type="hidden" name="projectId" value={projectId} />
              <div>
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" required />
              </div>
              <div>
                <Label htmlFor="domain">Domain</Label>
                <Input id="domain" name="domain" required />
              </div>
              <Button type="submit">Add competitor</Button>
            </form>

            {!competitors?.length ? (
              <EmptyState title="No active competitors" description="Add competitors to prepare comparison context." />
            ) : (
              <div className="space-y-3">
                {competitors.map((competitor) => (
                  <form key={competitor.id} action={updateCompetitor} className="space-y-2 rounded border p-3">
                    <input type="hidden" name="projectId" value={projectId} />
                    <input type="hidden" name="competitorId" value={competitor.id} />
                    <Input name="name" defaultValue={competitor.name} required />
                    <Input name="domain" defaultValue={competitor.domain} required />
                    <div className="flex gap-2">
                      <Button type="submit" variant="outline">Save</Button>
                      <button
                        formAction={deactivateCompetitor}
                        className="inline-flex h-9 items-center rounded-md border border-slate-300 px-3 text-sm hover:bg-slate-100"
                        type="submit"
                      >
                        Deactivate
                      </button>
                    </div>
                  </form>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><h2 className="font-medium">Runs</h2></CardHeader>
          <CardContent>
            {!runs?.length ? (
              <EmptyState title="No runs yet" description="Run your first scan to create run and job records." />
            ) : (
              <div className="space-y-3">
                {runs.map((run) => (
                  <div key={run.id} className="rounded border p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium">{run.status}</p>
                      <Link className="underline" href={`/dashboard/projects/${projectId}/runs/${run.id}`}>
                        View run
                      </Link>
                    </div>
                    <p className="mt-1 text-slate-600">Created: {new Date(run.created_at).toLocaleString()}</p>
                    <p className="text-slate-600">
                      Prompts: {run.total_prompts} · Success: {run.successful_prompts} · Failed: {run.failed_prompts}
                    </p>
                    <p className="text-slate-600">
                      Started: {run.started_at ? new Date(run.started_at).toLocaleString() : "-"} · Finished: {run.finished_at ? new Date(run.finished_at).toLocaleString() : "-"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><h2 className="font-medium">Recommendations</h2></CardHeader>
          <CardContent>
            <EmptyState
              title="No recommendations yet"
              description="Evidence-based recommendations will appear after scan execution phases."
            />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
