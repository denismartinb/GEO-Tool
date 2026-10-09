import {
  createRequestLimiter,
  FIELD_ERROR_MESSAGES,
  parseFreeReportForm,
  type FreeReportRequest
} from "@/lib/free-report/request";

/**
 * FREE-REPORT-1 Fase 1 — what a submit does, as a pure core with injected
 * senders (`.claude/rules/server-actions.md`: the outcome is returned, not
 * decided with `redirect()`).
 *
 * Order matters:
 *   1. Parse. Bots get a success-shaped answer and nothing is sent.
 *   2. Limit. Over the limit, the visitor is told to wait; nothing is sent.
 *      The hit is recorded only after step 3 succeeds (see `record`).
 *   3. Operator email. If it is not accepted, the request would vanish, so
 *      the visitor sees an error and NO confirmation goes out — telling them
 *      «recibido» for a request nobody received is a fake success.
 *   4. Confirmation to the requester. Its failure does not undo step 3: the
 *      operator has the request and will deliver the report regardless.
 */

export type FreeReportState =
  | { status: "idle" }
  | { status: "error"; field?: string; message: string }
  | { status: "ok"; domain: string; email: string };

export type FreeReportDeps = {
  now: () => number;
  ipHash: string | null;
  source: string | null;
  limiter: ReturnType<typeof createRequestLimiter>;
  sendOps: (request: FreeReportRequest, input: { requestedAt: Date; source: string | null }) => Promise<boolean>;
  sendConfirmation: (request: FreeReportRequest) => Promise<boolean>;
  log?: (event: string, detail?: Record<string, unknown>) => void;
};

export const SUBMIT_MESSAGES = {
  tooFast: "Un momento: la página aún estaba cargando. Pulsa de nuevo «Pedir mi informe gratis».",
  limited: "Ya hemos recibido una petición para esta web o desde este correo hoy. Te escribiremos con el informe; si necesitas algo más, escríbenos a soporte@genscore.es.",
  unavailable: "No hemos podido registrar tu petición ahora mismo. Inténtalo de nuevo en unos minutos o escríbenos a soporte@genscore.es."
} as const;

export async function submitFreeReportCore(formData: FormData, deps: FreeReportDeps): Promise<FreeReportState> {
  const now = deps.now();
  const log = deps.log ?? (() => {});
  const parsed = parseFreeReportForm(formData, now);

  if (!parsed.ok) {
    if (parsed.kind === "too_fast") {
      log("too_fast");
      return { status: "error", message: SUBMIT_MESSAGES.tooFast };
    }
    if (parsed.kind === "bot") {
      log("bot_dropped");
      // Same screen a person sees, so a script learns nothing; nothing is sent.
      const domain = String(formData.get("domain") ?? "").trim().slice(0, 100);
      return { status: "ok", domain, email: "" };
    }
    return { status: "error", field: parsed.field, message: FIELD_ERROR_MESSAGES[parsed.field] };
  }

  const { request } = parsed;
  const limitKey = { ipHash: deps.ipHash, domain: request.domain, email: request.email };
  if (!deps.limiter.allows(limitKey, now)) {
    log("limited", { domain: request.domain });
    return { status: "error", message: SUBMIT_MESSAGES.limited };
  }

  const delivered = await deps.sendOps(request, { requestedAt: new Date(now), source: deps.source });
  if (!delivered) {
    log("ops_email_not_accepted", { domain: request.domain });
    return { status: "error", message: SUBMIT_MESSAGES.unavailable };
  }
  deps.limiter.record(limitKey, now);

  const confirmed = await deps.sendConfirmation(request);
  if (!confirmed) log("confirmation_not_accepted", { domain: request.domain });

  return { status: "ok", domain: request.domain, email: request.email };
}
