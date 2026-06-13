import "server-only";

import { createServiceClient } from "@/lib/supabase/service";

export async function logJob(
  service: ReturnType<typeof createServiceClient>,
  row: {
    jobId: string;
    projectId: string;
    runId: string;
    level: "debug" | "info" | "warn" | "error";
    message: string;
    context?: Record<string, unknown>;
  }
) {
  await service.from("job_logs").insert({
    job_id: row.jobId,
    project_id: row.projectId,
    run_id: row.runId,
    level: row.level,
    message: row.message,
    context_json: row.context ?? {}
  });
}
