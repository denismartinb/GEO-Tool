import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";

export default async function RunDetailPage({
  params
}: {
  params: Promise<{ projectId: string; runId: string }>;
}) {
  const { projectId, runId } = await params;
  const { supabase } = await requireUser();

  const { data: run } = await supabase
    .from("scan_runs")
    .select("id, project_id, status, total_prompts, successful_prompts, failed_prompts, extraction_version, scoring_version, created_at, started_at, finished_at")
    .eq("id", runId)
    .eq("project_id", projectId)
    .single();

  if (!run) notFound();

  const { data: jobs } = await supabase
    .from("jobs")
    .select("id, job_type, status, attempt_count, max_attempts, created_at")
    .eq("run_id", runId)
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Run Detail</h1>
        <Link href={`/dashboard/projects/${projectId}`} className="text-sm underline">
          Back to project
        </Link>
      </div>

      <Card>
        <CardHeader><h2 className="font-medium">Run Metadata</h2></CardHeader>
        <CardContent className="space-y-1 text-sm text-slate-700">
          <p>Status: {run.status}</p>
          <p>Total prompts: {run.total_prompts}</p>
          <p>Successful prompts: {run.successful_prompts}</p>
          <p>Failed prompts: {run.failed_prompts}</p>
          <p>Extraction version: {run.extraction_version}</p>
          <p>Scoring version: {run.scoring_version}</p>
          <p>Created: {new Date(run.created_at).toLocaleString()}</p>
          <p>Started: {run.started_at ? new Date(run.started_at).toLocaleString() : "-"}</p>
          <p>Finished: {run.finished_at ? new Date(run.finished_at).toLocaleString() : "-"}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><h2 className="font-medium">Jobs</h2></CardHeader>
        <CardContent>
          {!jobs?.length ? (
            <EmptyState title="No jobs found" description="Jobs should be created when a scan is queued." />
          ) : (
            <div className="space-y-2">
              {jobs.map((job) => (
                <div key={job.id} className="rounded border p-3 text-sm text-slate-700">
                  <p className="font-medium">{job.job_type} · {job.status}</p>
                  <p>Attempts: {job.attempt_count}/{job.max_attempts}</p>
                  <p>Created: {new Date(job.created_at).toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><h2 className="font-medium">Execution Placeholder</h2></CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600">Prompt execution will be implemented in the next phase.</p>
        </CardContent>
      </Card>
    </div>
  );
}
