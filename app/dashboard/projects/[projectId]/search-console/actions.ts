"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { requireActiveProject } from "@/lib/project-workspace";
import { disconnectCore, selectPropertyCore } from "@/lib/search-console/property-core";
import { PROPERTY_MAX_LENGTH } from "@/lib/search-console/property";
import { screenPath } from "@/lib/search-console/oauth-cookie";

/**
 * SEARCH-SEO-1 Fase 3 (log §284). Thin translations of the cores in
 * `lib/search-console/property-core.ts`: validate, prove ownership, call the
 * core, map each outcome to one redirect.
 */

const projectIdSchema = z.string().uuid();
const selectSchema = z.object({
  projectId: projectIdSchema,
  property: z.string().min(1).max(PROPERTY_MAX_LENGTH)
});

export async function selectPropertyAction(formData: FormData) {
  const parsed = selectSchema.safeParse({ projectId: formData.get("projectId"), property: formData.get("property") });
  if (!parsed.success) redirect("/dashboard");
  const { projectId, property } = parsed.data;
  const { user } = await requireUser();
  const project = await requireActiveProject(projectId);

  const result = await selectPropertyCore({ projectId, ownerUserId: user.id }, project.domain, property);
  revalidatePath(screenPath(projectId));
  redirect(result.ok ? screenPath(projectId) : `${screenPath(projectId)}?gsc=property_${result.error}`);
}

export async function disconnectSearchConsoleAction(projectId: string) {
  const parsed = projectIdSchema.safeParse(projectId);
  if (!parsed.success) redirect("/dashboard");
  const { user } = await requireUser();
  await requireActiveProject(parsed.data);

  const result = await disconnectCore({ projectId: parsed.data, ownerUserId: user.id });
  revalidatePath(screenPath(parsed.data));
  revalidatePath(`/dashboard/projects/${parsed.data}`);
  redirect(`${screenPath(parsed.data)}?gsc=${result.ok ? "disconnected" : "disconnect_failed"}`);
}
