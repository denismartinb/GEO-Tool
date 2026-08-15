"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOperator } from "@/lib/admin/operator";
import { isProOrAbove } from "@/lib/billing";
import { sendAdminAutomationChangeAlertEmail } from "@/lib/email/transactional";
import { AUDIT_HALF_COLUMN, checkRecurringScansPrecondition } from "@/lib/projects/automation-toggles";

/**
 * ADMIN-CONSOLE-2b. Las dos únicas escrituras que `/admin` hace sobre datos de
 * un cliente en esta fase: el interruptor de escaneo recurrente y las dos
 * mitades de auditoría automática — los mismos tres que 2a ya muestra en
 * sólo lectura.
 *
 * Tres invariantes, ninguno opcional:
 *
 * 1. El operador nunca tiene un atajo que el propio dueño no tiene. Las
 *    precondiciones (escaneo completado para el recurrente, columna viva
 *    para la auditoría) son las MISMAS que corren en
 *    `app/dashboard/projects/[projectId]/actions.ts`, importadas de
 *    `lib/projects/automation-toggles.ts` — no reescritas.
 * 2. Cada escritura exige un motivo, y cada escritura manda un email a
 *    OPS_ALERT_EMAIL. No hay tabla de auditoría nueva (sin migración
 *    aprobada); el email ES el registro.
 * 3. Nunca se activa un interruptor que el backend va a ignorar. El
 *    recurrente en Free no escanea nunca (`skipped_plan_ineligible`,
 *    `lib/scan/cron.ts`); la mitad de cobertura por debajo de Pro tampoco
 *    corre (`plan_required`, `lib/web-audit/audit-job-runner.ts`). Dejar
 *    marcarlos igualmente sería el mismo "on + coste, pero no hace nada" que
 *    ya costó una QA bloqueada en 2a (log §71) — aquí se rechaza antes de
 *    escribir, no se documenta después.
 */

const reasonSchema = z
  .string()
  .trim()
  .min(5, "El motivo es obligatorio y debe explicar el cambio (mínimo 5 caracteres).")
  .max(500);

const toggleSchema = z.object({
  projectId: z.string().uuid(),
  enabled: z.enum(["true", "false"]),
  reason: reasonSchema,
  q: z.string().optional(),
  status: z.string().optional()
});

const auditHalfToggleSchema = toggleSchema.extend({ half: z.enum(["technical", "coverage"]) });

function adminUsersUrl(userId: string | null, extra: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  if (userId) params.set("u", userId);
  for (const [key, value] of Object.entries(extra)) {
    if (value) params.set(key, value);
  }
  return `/admin/users?${params.toString()}`;
}

type ProjectForWrite = {
  id: string;
  name: string;
  domain: string;
  owner_user_id: string;
  is_archived: boolean;
};

async function loadProjectForWrite(
  service: Awaited<ReturnType<typeof requireOperator>>["service"],
  projectId: string
): Promise<ProjectForWrite | null> {
  const { data } = await service
    .from("projects")
    .select("id, name, domain, owner_user_id, is_archived")
    .eq("id", projectId)
    .maybeSingle();
  return data ?? null;
}

/** Se pide una sola vez por escritura y se reutiliza para el chequeo de plan y para el email — dos usos, una consulta. */
async function loadOwnerProfile(
  service: Awaited<ReturnType<typeof requireOperator>>["service"],
  ownerUserId: string
): Promise<{ email: string | null; current_plan: string | null } | null> {
  const { data } = await service.from("profiles").select("email, current_plan").eq("id", ownerUserId).maybeSingle();
  return data ?? null;
}

async function notifyAdminAutomationChange(input: {
  operatorEmail: string;
  targetUserEmail: string | null;
  project: ProjectForWrite;
  change: string;
  reason: string;
}): Promise<void> {
  try {
    await sendAdminAutomationChangeAlertEmail({
      operatorEmail: input.operatorEmail,
      targetUserEmail: input.targetUserEmail ?? input.project.owner_user_id,
      targetUserId: input.project.owner_user_id,
      domain: input.project.domain,
      projectId: input.project.id,
      change: input.change,
      reason: input.reason,
      changedAt: new Date()
    });
  } catch (error) {
    // El email es el único registro que existe de esta escritura — si falla,
    // se dice alto y claro en los logs del servidor, nunca en silencio.
    console.error("[geo:admin] failed to send the automation-change alert email", {
      projectId: input.project.id,
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

export async function setRecurringScansAsOperator(formData: FormData) {
  const { user, service } = await requireOperator("/admin/users");

  const parsed = toggleSchema.safeParse({
    projectId: formData.get("projectId"),
    enabled: formData.get("enabled"),
    reason: formData.get("reason"),
    q: formData.get("q") ?? undefined,
    status: formData.get("status") ?? undefined
  });

  if (!parsed.success) {
    redirect(adminUsersUrl(null, { admin_error: "invalid_input" }));
  }

  const { projectId, reason, q, status } = parsed.data;
  const enabled = parsed.data.enabled === "true";

  const project = await loadProjectForWrite(service, projectId);
  if (!project || project.is_archived) {
    redirect(adminUsersUrl(project?.owner_user_id ?? null, { q, status, admin_error: "project_not_found" }));
  }

  const owner = await loadOwnerProfile(service, project.owner_user_id);

  if (enabled) {
    if ((owner?.current_plan ?? "free") === "free") {
      redirect(adminUsersUrl(project.owner_user_id, { q, status, admin_error: "recurring_free_plan_ineffective" }));
    }

    const check = await checkRecurringScansPrecondition(service, projectId);
    if (!check.ok) {
      redirect(adminUsersUrl(project.owner_user_id, { q, status, admin_error: check.reason }));
    }
  }

  const { data, error } = await service
    .from("projects")
    .update({ recurring_scans_enabled: enabled })
    .eq("id", projectId)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    redirect(adminUsersUrl(project.owner_user_id, { q, status, admin_error: "recurring_update_failed" }));
  }

  await notifyAdminAutomationChange({
    operatorEmail: user.email ?? user.id,
    targetUserEmail: owner?.email ?? null,
    project,
    change: `Escaneo recurrente → ${enabled ? "activado" : "desactivado"}`,
    reason
  });

  redirect(
    adminUsersUrl(project.owner_user_id, { q, status, admin_success: enabled ? "recurring_enabled" : "recurring_disabled" })
  );
}

export async function setAutoAuditHalfAsOperator(formData: FormData) {
  const { user, service } = await requireOperator("/admin/users");

  const parsed = auditHalfToggleSchema.safeParse({
    projectId: formData.get("projectId"),
    enabled: formData.get("enabled"),
    reason: formData.get("reason"),
    half: formData.get("half"),
    q: formData.get("q") ?? undefined,
    status: formData.get("status") ?? undefined
  });

  if (!parsed.success) {
    redirect(adminUsersUrl(null, { admin_error: "invalid_input" }));
  }

  const { projectId, reason, half, q, status } = parsed.data;
  const enabled = parsed.data.enabled === "true";

  const project = await loadProjectForWrite(service, projectId);
  if (!project || project.is_archived) {
    redirect(adminUsersUrl(project?.owner_user_id ?? null, { q, status, admin_error: "project_not_found" }));
  }

  const owner = await loadOwnerProfile(service, project.owner_user_id);

  if (enabled && half === "coverage" && !isProOrAbove(owner?.current_plan)) {
    redirect(adminUsersUrl(project.owner_user_id, { q, status, admin_error: "coverage_plan_ineffective" }));
  }

  const column = AUDIT_HALF_COLUMN[half];
  const { data, error } = await service
    .from("projects")
    .update({ [column]: enabled })
    .eq("id", projectId)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    redirect(adminUsersUrl(project.owner_user_id, { q, status, admin_error: "auto_audit_update_failed" }));
  }

  await notifyAdminAutomationChange({
    operatorEmail: user.email ?? user.id,
    targetUserEmail: owner?.email ?? null,
    project,
    change: `Auditoría automática (${half === "technical" ? "técnica" : "cobertura IA"}) → ${enabled ? "activada" : "desactivada"}`,
    reason
  });

  redirect(
    adminUsersUrl(project.owner_user_id, {
      q,
      status,
      admin_success: `audit_${half}_${enabled ? "enabled" : "disabled"}`
    })
  );
}
