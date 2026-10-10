import { createRequestLimiter } from "@/lib/free-report/request";
import {
  AFFILIATE_FIELD_ERROR_MESSAGES,
  parseAffiliateForm,
  type AffiliateApplication
} from "@/lib/affiliates/request";

/**
 * AFFILIATES-1 — what an application submit does, as a pure core with
 * injected senders. Same order and same reasons as
 * `lib/free-report/submit.ts`:
 *   1. Parse. Bots get a success-shaped answer and nothing is sent.
 *   2. Limit. Over the limit, nothing is sent; the hit is recorded only
 *      after step 3 succeeds.
 *   3. Operator email. Not accepted means the application would vanish, so
 *      the visitor sees an error and NO confirmation goes out.
 *   4. Confirmation to the applicant. Its failure does not undo step 3.
 */

export type AffiliateApplyState =
  | { status: "idle" }
  | { status: "error"; field?: string; message: string }
  | { status: "ok"; name: string; email: string };

export type AffiliateApplyDeps = {
  now: () => number;
  ipHash: string | null;
  source: string | null;
  limiter: ReturnType<typeof createRequestLimiter>;
  sendOps: (application: AffiliateApplication, input: { requestedAt: Date; source: string | null }) => Promise<boolean>;
  sendConfirmation: (application: AffiliateApplication) => Promise<boolean>;
  log?: (event: string, detail?: Record<string, unknown>) => void;
};

export const AFFILIATE_SUBMIT_MESSAGES = {
  tooFast: "Un momento: la página aún estaba cargando. Pulsa de nuevo «Quiero ser afiliado».",
  limited:
    "Ya hemos recibido una solicitud desde este correo o para este canal hoy. Te escribiremos en cuanto la revisemos; si necesitas algo, escríbenos a soporte@genscore.es.",
  unavailable:
    "No hemos podido registrar tu solicitud ahora mismo. Inténtalo de nuevo en unos minutos o escríbenos a soporte@genscore.es."
} as const;

export async function submitAffiliateApplicationCore(
  formData: FormData,
  deps: AffiliateApplyDeps
): Promise<AffiliateApplyState> {
  const now = deps.now();
  const log = deps.log ?? (() => {});
  const parsed = parseAffiliateForm(formData, now);

  if (!parsed.ok) {
    if (parsed.kind === "too_fast") {
      log("too_fast");
      return { status: "error", message: AFFILIATE_SUBMIT_MESSAGES.tooFast };
    }
    if (parsed.kind === "bot") {
      log("bot_dropped");
      // Same screen a person sees, so a script learns nothing; nothing is sent.
      return { status: "ok", name: "", email: "" };
    }
    return { status: "error", field: parsed.field, message: AFFILIATE_FIELD_ERROR_MESSAGES[parsed.field] };
  }

  const { application } = parsed;
  // `domain` is the limiter's per-target key; here the target is the channel.
  const limitKey = { ipHash: deps.ipHash, domain: application.channel.toLowerCase(), email: application.email };
  if (!deps.limiter.allows(limitKey, now)) {
    log("limited", { email: application.email });
    return { status: "error", message: AFFILIATE_SUBMIT_MESSAGES.limited };
  }

  const delivered = await deps.sendOps(application, { requestedAt: new Date(now), source: deps.source });
  if (!delivered) {
    log("ops_email_not_accepted", { email: application.email });
    return { status: "error", message: AFFILIATE_SUBMIT_MESSAGES.unavailable };
  }
  deps.limiter.record(limitKey, now);

  const confirmed = await deps.sendConfirmation(application);
  if (!confirmed) log("confirmation_not_accepted", { email: application.email });

  return { status: "ok", name: application.name, email: application.email };
}
