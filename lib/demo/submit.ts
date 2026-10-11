import { createRequestLimiter } from "@/lib/free-report/request";
import { DEMO_FIELD_ERROR_MESSAGES, parseDemoForm, type DemoRequest } from "@/lib/demo/request";
import { formatDemoSlot } from "@/lib/demo/slots";

/**
 * DEMO-CALL-1 — what a submit does. Same order and the same reason as
 * `submitFreeReportCore`: the visitor only sees «recibido» once the operator
 * email was accepted, because a request nobody received is a fake success.
 */

export type DemoState =
  | { status: "idle" }
  | { status: "error"; field?: string; message: string }
  | { status: "ok"; when: string; email: string };

export type DemoDeps = {
  now: () => number;
  ipHash: string | null;
  source: string | null;
  limiter: ReturnType<typeof createRequestLimiter>;
  sendOps: (request: DemoRequest, input: { requestedAt: Date; source: string | null }) => Promise<boolean>;
  sendConfirmation: (request: DemoRequest) => Promise<boolean>;
  log?: (event: string, detail?: Record<string, unknown>) => void;
};

/** Two calls a day per web, per email or per IP: enough to rebook, too few to flood the inbox. */
export const DEMO_REQUEST_LIMITS = { perIpPerDay: 3, perDomainPerDay: 2, perEmailPerDay: 2 };

export const DEMO_SUBMIT_MESSAGES = {
  tooFast: "Un momento: la página aún estaba cargando. Pulsa de nuevo «Pedir videollamada».",
  limited: "Ya tenemos tu solicitud de hoy. Te escribiremos para confirmarla; si necesitas cambiarla, escríbenos a soporte@genscore.es.",
  unavailable: "No hemos podido registrar tu solicitud ahora mismo. Inténtalo de nuevo en unos minutos o escríbenos a soporte@genscore.es."
} as const;

export async function submitDemoCore(formData: FormData, deps: DemoDeps): Promise<DemoState> {
  const now = deps.now();
  const log = deps.log ?? (() => {});
  const parsed = parseDemoForm(formData, now);

  if (!parsed.ok) {
    if (parsed.kind === "too_fast") {
      log("too_fast");
      return { status: "error", message: DEMO_SUBMIT_MESSAGES.tooFast };
    }
    if (parsed.kind === "bot") {
      log("bot_dropped");
      return { status: "ok", when: "", email: "" };
    }
    return { status: "error", field: parsed.field, message: DEMO_FIELD_ERROR_MESSAGES[parsed.field] };
  }

  const { request } = parsed;
  const limitKey = { ipHash: deps.ipHash, domain: request.domain, email: request.email };
  if (!deps.limiter.allows(limitKey, now)) {
    log("limited", { domain: request.domain });
    return { status: "error", message: DEMO_SUBMIT_MESSAGES.limited };
  }

  const delivered = await deps.sendOps(request, { requestedAt: new Date(now), source: deps.source });
  if (!delivered) {
    log("ops_email_not_accepted", { domain: request.domain });
    return { status: "error", message: DEMO_SUBMIT_MESSAGES.unavailable };
  }
  deps.limiter.record(limitKey, now);

  const confirmed = await deps.sendConfirmation(request);
  if (!confirmed) log("confirmation_not_accepted", { domain: request.domain });

  return { status: "ok", when: formatDemoSlot(request.slot), email: request.email };
}
