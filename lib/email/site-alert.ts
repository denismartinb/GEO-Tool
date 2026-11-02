import "server-only";

import {
  button,
  escapeHtml,
  eyebrow,
  heading,
  optionalEmailEnvelope,
  paragraph,
  sendEmailWithOutcome,
  subtext,
  wrap,
  type SendOutcome
} from "@/lib/email/transactional";
import { isLifecycleEmailEnabled } from "@/lib/email/lifecycle/flag";
import type { createServiceClient } from "@/lib/supabase/service";

/**
 * GEO-ALERTS-1 (log §440): «Avisos de tu web». One email when an AI engine
 * that could enter the site in the previous audit cannot in this one, by
 * robots.txt or by the server. Never for a state that did not change, never
 * for a training bot, at most one per engine and project every 30 days.
 *
 * Gates, all of them fail closed:
 * - the lifecycle switch (`LIFECYCLE_EMAILS_ENABLED` + unsubscribe secret),
 *   as the founder approved («el mismo interruptor que los demás»);
 * - `profiles.notify_site_alerts` (migration 0049), read on its own: if the
 *   column is not there, nobody can unsubscribe, so nothing is sent;
 * - the 30-day check over earlier notices of the same engine that carry
 *   `emailedAt`.
 *
 * The mark (`emailedAt` on the notice) is written AFTER a send Resend
 * accepted, never before, so a failed send is retried by the next audit
 * that sees the same transition, and the Resend idempotency key stops a
 * retried invocation from sending twice.
 */

type ServiceClient = ReturnType<typeof createServiceClient>;

export const SITE_ALERT_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

export type SiteAlertChange = {
  /** Engine name, «ChatGPT». */
  engine: string;
  by: "server" | "robots";
  /** Bot tokens to check, «OAI-SearchBot». */
  tokens: string[];
  /** `notifications.dedupe_key` of the notice this email belongs to. */
  dedupeKey: string;
};

/** Pure: subject and body. Exported for tests. */
export function renderSiteAlertEmail(input: {
  domain: string;
  projectId: string;
  change: Pick<SiteAlertChange, "engine" | "by" | "tokens">;
  footerHtml: string;
}): { subject: string; html: string } {
  const engine = escapeHtml(input.change.engine);
  const domain = escapeHtml(input.domain);
  const server = input.change.by === "server";
  const tokens = input.change.tokens.map((t) => escapeHtml(t)).join(", ");
  const tokenBox = `<div style="margin:12px 0 0;padding:10px 14px;border-radius:10px;background:#F7F8FB;border:1px solid #E7EAF0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13.5px;color:#0B1426;">${tokens}</div>`;
  const html = wrap(
    `
    ${eyebrow("Aviso de tu web", "#C2410C")}
    ${heading(`Desde hoy, la búsqueda de ${engine} no puede entrar en tu web`)}
    ${paragraph(
      server
        ? "En la auditoría anterior entraba. Hoy tu servidor le responde con un bloqueo, aunque tu robots.txt le deja pasar."
        : "En la auditoría anterior entraba. Hoy tu robots.txt lo bloquea."
    )}
    ${paragraph(`<b style="color:#0B1426;">Por qué importa:</b> mientras siga así, ${engine} no puede leer tus páginas ni citarlas en sus respuestas.`)}
    ${paragraph(
      server
        ? "Suele ser una regla de Cloudflare o del cortafuegos. Comprueba que este bot no esté bloqueado:"
        : "Revisa la regla de tu robots.txt para este bot:"
    )}
    ${tokenBox}
    ${button(`https://www.genscore.es/dashboard/projects/${input.projectId}/web-audit?bloque=geo`, "Ver cómo arreglarlo")}
    ${server ? subtext("Lo hemos reproducido desde nuestro servidor con el nombre del bot (simulación).") : ""}
  `,
    { footerHtml: input.footerHtml, preheader: `${input.change.engine} ya no puede leer ${input.domain}.` }
  );
  return { subject: `${input.change.engine} ya no puede leer ${input.domain}`, html };
}

/** Whether this engine already got an email for this project in the last 30 days. */
async function emailedRecently(
  service: ServiceClient,
  input: { ownerUserId: string; projectId: string; engine: string; now: number }
): Promise<boolean | null> {
  const { data, error } = await service
    .from("notifications")
    .select("payload_json")
    .eq("owner_user_id", input.ownerUserId)
    .eq("project_id", input.projectId)
    .eq("type", "ai_bot_blocked")
    .gte("created_at", new Date(input.now - SITE_ALERT_COOLDOWN_MS).toISOString())
    .limit(50);
  if (error) return null;
  return ((data ?? []) as Array<{ payload_json: Record<string, unknown> | null }>).some((row) => {
    const p = row.payload_json ?? {};
    return p.agent === input.engine && typeof p.emailedAt === "string";
  });
}

/**
 * Sends what is due and marks it. Never throws; returns the engines emailed,
 * for the log.
 */
export async function sendSiteAlertEmails(input: {
  service: ServiceClient;
  ownerUserId: string;
  projectId: string;
  projectDomain: string;
  changes: SiteAlertChange[];
  now?: number;
}): Promise<string[]> {
  const sent: string[] = [];
  if (input.changes.length === 0 || !isLifecycleEmailEnabled()) return sent;
  try {
    const { data: profile, error } = await input.service
      .from("profiles")
      .select("email, notify_site_alerts")
      .eq("id", input.ownerUserId)
      .maybeSingle();
    const row = profile as { email?: string | null; notify_site_alerts?: boolean | null } | null;
    if (error || !row?.email || row.notify_site_alerts !== true) return sent;

    const envelope = optionalEmailEnvelope(input.ownerUserId, "site_alerts");
    const now = input.now ?? Date.now();
    for (const change of input.changes) {
      const recent = await emailedRecently(input.service, {
        ownerUserId: input.ownerUserId,
        projectId: input.projectId,
        engine: change.engine,
        now
      });
      if (recent !== false) continue;

      const { subject, html } = renderSiteAlertEmail({
        domain: input.projectDomain,
        projectId: input.projectId,
        change,
        footerHtml: envelope.footerHtml
      });
      const outcome: SendOutcome = await sendEmailWithOutcome(
        { kind: "site_alert", to: row.email, subject, html, headers: envelope.headers },
        { idempotencyKey: `site-alert/${input.ownerUserId}/${change.dedupeKey}` }
      );
      if (outcome !== "sent") continue;

      const { data: notice } = await input.service
        .from("notifications")
        .select("payload_json")
        .eq("owner_user_id", input.ownerUserId)
        .eq("dedupe_key", change.dedupeKey)
        .maybeSingle();
      const payload = ((notice as { payload_json?: Record<string, unknown> } | null)?.payload_json ?? {}) as Record<string, unknown>;
      await input.service
        .from("notifications")
        .update({ payload_json: { ...payload, emailedAt: new Date(now).toISOString() } })
        .eq("owner_user_id", input.ownerUserId)
        .eq("dedupe_key", change.dedupeKey);
      sent.push(change.engine);
    }
  } catch (error) {
    console.error("[geo:email] site alert failed", {
      projectId: input.projectId,
      message: error instanceof Error ? error.message : String(error)
    });
  }
  return sent;
}
