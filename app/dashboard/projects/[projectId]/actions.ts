"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";

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

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("is_archived", false)
    .single();

  if (projectError || !project) {
    redirect(`/dashboard/projects?error=${encodeURIComponent("Project not found or not owned.")}`);
  }

  const { data: activeRun } = await supabase
    .from("scan_runs")
    .select("id")
    .eq("project_id", projectId)
    .in("status", ["pending", "running"])
    .limit(1)
    .maybeSingle();

  if (activeRun) {
    redirect(`/dashboard/projects/${projectId}?error=${encodeURIComponent("An active scan is already running for this project.")}`);
  }

  const { data: activePrompts, error: promptError } = await supabase
    .from("project_prompts")
    .select("id, prompt_text")
    .eq("project_id", projectId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (promptError) {
    redirect(`/dashboard/projects/${projectId}?error=${encodeURIComponent("Could not read active prompts.")}`);
  }

  if (!activePrompts?.length) {
    redirect(`/dashboard/projects/${projectId}?error=${encodeURIComponent("Add at least one active prompt before running a scan.")}`);
  }

  const service = createServiceClient();
  const promptCount = activePrompts.length;

  const { data: run, error: runError } = await service
    .from("scan_runs")
    .insert({
      project_id: projectId,
      triggered_by_user_id: user.id,
      status: "pending",
      total_prompts: promptCount,
      successful_prompts: 0,
      failed_prompts: 0,
      extraction_version: "v1",
      scoring_version: "v1"
    })
    .select("id")
    .single();

  if (runError || !run) {
    redirect(`/dashboard/projects/${projectId}?error=${encodeURIComponent("Could not create scan run.")}`);
  }

  const jobsPayload = [
    {
      project_id: projectId,
      run_id: run.id,
      job_type: "scan_start",
      status: "pending",
      payload_json: { run_id: run.id, project_id: projectId }
    },
    ...activePrompts.map((prompt) => ({
      project_id: projectId,
      run_id: run.id,
      job_type: "scan_prompt",
      status: "pending",
      payload_json: {
        run_id: run.id,
        project_id: projectId,
        prompt_id: prompt.id,
        prompt_text: prompt.prompt_text
      }
    })),
    {
      project_id: projectId,
      run_id: run.id,
      job_type: "scan_finalize",
      status: "pending",
      payload_json: { run_id: run.id, project_id: projectId }
    }
  ];

  const { error: jobsError } = await service.from("jobs").insert(jobsPayload);

  if (jobsError) {
    redirect(`/dashboard/projects/${projectId}?error=${encodeURIComponent("Scan run created but jobs creation failed.")}`);
  }

  revalidatePath(`/dashboard/projects/${projectId}`);
  redirect(`/dashboard/projects/${projectId}?success=${encodeURIComponent("Scan queued successfully.")}`);
}
