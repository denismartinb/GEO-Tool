"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import {
  ENABLE_SYNC_SCAN_EXECUTION,
  executePendingScan,
  getActionErrorCode,
  launchScan
} from "@/lib/scan/scan-runner";

const promptCreateSchema = z.object({
  projectId: z.string().uuid(),
  promptText: z.string().min(10).max(3000),
  category: z.string().max(100).optional().or(z.literal(""))
});

const competitorCreateSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1).max(120),
  domain: z.string().min(3).max(255)
});

const scanStartSchema = z.object({
  projectId: z.string().uuid()
});

const scanExecuteSchema = z.object({
  projectId: z.string().uuid(),
  runId: z.string().uuid()
});

export async function createPrompt(formData: FormData) {
  const payload = promptCreateSchema.parse({
    projectId: formData.get("projectId"),
    promptText: formData.get("promptText"),
    category: formData.get("category")
  });

  const { supabase } = await requireUser();
  await supabase.from("project_prompts").insert({
    project_id: payload.projectId,
    prompt_text: payload.promptText,
    category: payload.category || null
  });

  revalidatePath(`/dashboard/projects/${payload.projectId}`);
}

export async function updatePrompt(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const promptId = String(formData.get("promptId") ?? "");
  const promptText = String(formData.get("promptText") ?? "");
  const category = String(formData.get("category") ?? "");

  const { supabase } = await requireUser();
  await supabase
    .from("project_prompts")
    .update({ prompt_text: promptText, category: category || null })
    .eq("id", promptId)
    .eq("project_id", projectId);

  revalidatePath(`/dashboard/projects/${projectId}`);
}

export async function deactivatePrompt(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const promptId = String(formData.get("promptId") ?? "");

  const { supabase } = await requireUser();
  await supabase.from("project_prompts").update({ is_active: false }).eq("id", promptId).eq("project_id", projectId);

  revalidatePath(`/dashboard/projects/${projectId}`);
}

export async function createCompetitor(formData: FormData) {
  const payload = competitorCreateSchema.parse({
    projectId: formData.get("projectId"),
    name: formData.get("name"),
    domain: formData.get("domain")
  });

  const { supabase } = await requireUser();
  await supabase.from("project_competitors").insert({
    project_id: payload.projectId,
    name: payload.name,
    domain: payload.domain
  });

  revalidatePath(`/dashboard/projects/${payload.projectId}`);
}

export async function updateCompetitor(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const competitorId = String(formData.get("competitorId") ?? "");
  const name = String(formData.get("name") ?? "");
  const domain = String(formData.get("domain") ?? "");

  const { supabase } = await requireUser();
  await supabase
    .from("project_competitors")
    .update({ name, domain })
    .eq("id", competitorId)
    .eq("project_id", projectId);

  revalidatePath(`/dashboard/projects/${projectId}`);
}

export async function deactivateCompetitor(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const competitorId = String(formData.get("competitorId") ?? "");

  const { supabase } = await requireUser();
  await supabase
    .from("project_competitors")
    .update({ is_active: false })
    .eq("id", competitorId)
    .eq("project_id", projectId);

  revalidatePath(`/dashboard/projects/${projectId}`);
}

export async function startScan(formData: FormData) {
  const parsed = scanStartSchema.safeParse({
    projectId: formData.get("projectId")
  });

  if (!parsed.success) {
    redirect("/dashboard/projects?error=invalid_project_id");
  }

  const { projectId } = parsed.data;
  const { supabase, user } = await requireUser();
  let runId: string | null = null;
  let executed = false;

  try {
    const result = await launchScan({ projectId, supabase, user });
    runId = result.runId;
    executed = result.executed;
  } catch (error) {
    redirect(`/dashboard/projects/${projectId}?error=${encodeURIComponent(getActionErrorCode(error))}`);
  }

  revalidatePath(`/dashboard/projects/${projectId}`);
  if (runId) revalidatePath(`/dashboard/projects/${projectId}/runs/${runId}`);
  redirect(`/dashboard/projects/${projectId}?success=${executed ? "scan_completed" : "scan_pending"}`);
}

// Backwards-compatible action used by the workspace "Lanzar/Repetir escaneo"
// forms. Same behavior as startScan: create a run and execute it synchronously
// when sync execution is enabled.
export async function runProjectScan(formData: FormData) {
  return startScan(formData);
}

export async function executeScan(formData: FormData) {
  const parsed = scanExecuteSchema.safeParse({
    projectId: formData.get("projectId"),
    runId: formData.get("runId")
  });

  if (!parsed.success) {
    redirect("/dashboard/projects?error=invalid_run_or_project_id");
  }

  const { projectId, runId } = parsed.data;
  const { supabase } = await requireUser();

  if (!ENABLE_SYNC_SCAN_EXECUTION) {
    redirect(`/dashboard/projects/${projectId}?error=scan_unavailable`);
  }

  try {
    await executePendingScan({ projectId, runId, supabase });
  } catch (error) {
    redirect(`/dashboard/projects/${projectId}?error=${encodeURIComponent(getActionErrorCode(error))}`);
  }

  revalidatePath(`/dashboard/projects/${projectId}`);
  revalidatePath(`/dashboard/projects/${projectId}/runs/${runId}`);
  redirect(`/dashboard/projects/${projectId}?success=scan_completed`);
}

/**
 * Executes a pending scan run that was created without sync execution
 * (e.g. right after onboarding). Called from a client component on the
 * Escaneos page so the user lands there immediately and the heavy Gemini
 * work happens in this follow-up request while they watch the real
 * "scan in progress" UI. Does not redirect — the caller refreshes the page.
 */
export async function autoExecutePendingScan(input: { projectId: string; runId: string }): Promise<void> {
  const parsed = scanExecuteSchema.safeParse(input);
  if (!parsed.success || !ENABLE_SYNC_SCAN_EXECUTION) {
    return;
  }

  const { projectId, runId } = parsed.data;
  const { supabase } = await requireUser();

  try {
    await executePendingScan({ projectId, runId, supabase });
  } catch {
    // Another request may already be executing or have finished this run;
    // executePendingScan persists any real failure state itself.
  }

  revalidatePath(`/dashboard/projects/${projectId}`);
  revalidatePath(`/dashboard/projects/${projectId}/runs`);
  revalidatePath(`/dashboard/projects/${projectId}/runs/${runId}`);
}
