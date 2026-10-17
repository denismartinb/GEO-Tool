"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { fetchOnDomain } from "@/lib/agentic-audit/fetch";
import {
  runConsoleAgenticAuditCore,
  runConsoleAgenticAuditInputSchema,
  type ConsoleAgenticAuditResult
} from "@/lib/agentic-audit/console-audit";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveAgentTokenAccess } from "@/lib/web-audit/robots";

/**
 * AGENTIC-COMMERCE-1 Fase 2a (log §322, §323). Without `url`, the automatic
 * review the screen starts on its first visit; with `url`, «Elegir otra
 * ficha». A thin translation of `runConsoleAgenticAuditCore`, which checks
 * ownership, plan, domain and the daily limit before any request leaves.
 */
export async function runAgenticAuditAction(input: { projectId: string; url?: string }): Promise<ConsoleAgenticAuditResult> {
  const parsed = runConsoleAgenticAuditInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "invalid_url", message: "Escribe la dirección completa de una ficha de producto de tu tienda." };
  }
  const { supabase, user } = await requireUser();
  const result = await runConsoleAgenticAuditCore(parsed.data, {
    supabase,
    service: createServiceClient(),
    user,
    audit: { fetch: fetchOnDomain, tokenAllowed: resolveAgentTokenAccess }
  });
  if (result.success && !result.skipped) revalidatePath(`/dashboard/projects/${parsed.data.projectId}/agentic-audit`);
  return result;
}
