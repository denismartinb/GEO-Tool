import { z } from "zod";
import { cleanDomain, isWellFormedDomain } from "@/lib/projects/project-form";

/**
 * FREE-REPORT-1 Fase 1 — the «Pide tu informe GEO gratis» request.
 *
 * A visitor leaves a domain, a work email and one sentence about what they
 * sell. Nothing here calls an LLM: the request reaches the operator by email,
 * who runs `/admin/estudio` and sends the report by hand within 48 working
 * hours (Task Intake, `docs/brand/design-decisions-log.md` §248). That is why
 * this phase needs no migration and no spend cap — the only thing a public
 * form can cost us here is email, and that is what `createRequestLimiter`
 * bounds.
 *
 * Pure on purpose (no `server-only`): importable from Vitest, same criterion
 * as `lib/free-checker/rate-limit.ts`.
 */

/** Field names are the form's contract with the action — do not rename. */
export const FREE_REPORT_FIELDS = {
  domain: "domain",
  email: "email",
  business: "business",
  marketing: "marketing",
  /** Honeypot: hidden from people, filled by naive bots. */
  website: "website",
  /** Epoch ms when the form was rendered; a sub-3s submit is a bot. */
  renderedAt: "rendered_at",
  /** utm_source/utm_campaign the page was opened with, for the operator. */
  source: "source"
} as const;

/** The UTM pair, trimmed to something safe to show in an email. */
export function readSource(formData: FormData): string | null {
  const value = formData.get(FREE_REPORT_FIELDS.source);
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[^\w\-./ :]/g, "").trim().slice(0, 120);
  return cleaned || null;
}

/**
 * Throwaway inboxes. A report sent to one is a report nobody reads, and the
 * confirmation email would land in a public mailbox. Not exhaustive and not
 * meant to be: it catches the handful that show up in practice; the operator
 * reads every request anyway.
 */
export const DISPOSABLE_EMAIL_DOMAINS = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "guerrillamail.es",
  "sharklasers.com",
  "10minutemail.com",
  "10minutemail.net",
  "temp-mail.org",
  "tempmail.com",
  "tempmail.net",
  "yopmail.com",
  "yopmail.fr",
  "trashmail.com",
  "getnada.com",
  "dispostable.com",
  "maildrop.cc",
  "mintemail.com",
  "throwawaymail.com",
  "fakeinbox.com",
  "emailondeck.com",
  "mohmal.com"
]);

/** Below this, nobody typed three fields: it is a script. */
export const MIN_FILL_MS = 3_000;

const RawSchema = z.object({
  domain: z.string().trim().min(1).max(255),
  email: z.string().trim().toLowerCase().max(254).email(),
  business: z.string().trim().min(3).max(300),
  marketing: z.boolean(),
  website: z.string().max(500),
  renderedAt: z.number().finite().nonnegative()
});

export type FreeReportRequest = {
  domain: string;
  email: string;
  business: string;
  /** Opted in to commercial email (art. 21.1 LSSI). Unticked by default. */
  marketingConsent: boolean;
};

/** Which field the visitor has to fix. Each one has its own message. */
export type FreeReportFieldError = "domain" | "email" | "email_disposable" | "business";

export type FreeReportParseResult =
  | { ok: true; request: FreeReportRequest }
  /** A person got a field wrong: say which. */
  | { ok: false; kind: "invalid"; field: FreeReportFieldError }
  /** Honeypot or too fast. Answered like a success, never explained. */
  | { ok: false; kind: "bot" };

export const FIELD_ERROR_MESSAGES: Record<FreeReportFieldError, string> = {
  domain: "Escribe la dirección de tu web, por ejemplo tuempresa.es.",
  email: "Revisa el email: necesitamos uno al que podamos enviarte el informe.",
  email_disposable: "Este correo parece temporal. Usa el de tu empresa para que el informe te llegue.",
  business: "Cuéntanos en una frase qué vendes, para elegir las preguntas de tu sector."
};

function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export function parseFreeReportForm(formData: FormData, now: number): FreeReportParseResult {
  const renderedAtRaw = Number(readString(formData, FREE_REPORT_FIELDS.renderedAt));
  const raw = {
    domain: readString(formData, FREE_REPORT_FIELDS.domain),
    email: readString(formData, FREE_REPORT_FIELDS.email),
    business: readString(formData, FREE_REPORT_FIELDS.business),
    marketing: formData.get(FREE_REPORT_FIELDS.marketing) === "on",
    website: readString(formData, FREE_REPORT_FIELDS.website),
    renderedAt: Number.isFinite(renderedAtRaw) ? renderedAtRaw : 0
  };

  // Bots first: a filled honeypot must not learn which of its fields was wrong.
  if (raw.website.trim() !== "") return { ok: false, kind: "bot" };
  if (!raw.renderedAt || now - raw.renderedAt < MIN_FILL_MS) return { ok: false, kind: "bot" };

  const domain = cleanDomain(raw.domain);
  if (!isWellFormedDomain(domain)) return { ok: false, kind: "invalid", field: "domain" };

  const parsed = RawSchema.safeParse({ ...raw, domain });
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return { ok: false, kind: "invalid", field: field === "business" ? "business" : field === "domain" ? "domain" : "email" };
  }

  const emailDomain = parsed.data.email.split("@")[1] ?? "";
  if (DISPOSABLE_EMAIL_DOMAINS.has(emailDomain)) {
    return { ok: false, kind: "invalid", field: "email_disposable" };
  }

  return {
    ok: true,
    request: {
      domain,
      email: parsed.data.email,
      // One line: it goes into an email subject.
      business: parsed.data.business.replace(/\s+/g, " "),
      marketingConsent: parsed.data.marketing
    }
  };
}

export type RequestLimits = { perIpPerDay: number; perDomainPerDay: number; perEmailPerDay: number };

export const DEFAULT_REQUEST_LIMITS: RequestLimits = { perIpPerDay: 3, perDomainPerDay: 1, perEmailPerDay: 2 };

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Best-effort limiter, **per server instance**. Stated plainly because it is
 * weaker than it looks: Vercel runs several instances and recycles them, so
 * this stops someone hammering the button, not someone determined. That is
 * proportionate for Fase 1, where an abusive request costs two emails and no
 * LLM call, and every request lands in a human's inbox anyway. Fase 3 (fully
 * automatic, real spend) needs a table and the fail-closed counting of
 * `lib/free-checker/rate-limit.ts` — not this.
 */
export function createRequestLimiter(limits: RequestLimits = DEFAULT_REQUEST_LIMITS) {
  const hits = new Map<string, number[]>();

  const recent = (key: string, now: number) => (hits.get(key) ?? []).filter((t) => now - t < DAY_MS);

  return {
    /** Checks and, when allowed, records the attempt. */
    take(input: { ipHash: string | null; domain: string; email: string }, now: number): boolean {
      const keys: Array<[string, number]> = [
        [`d:${input.domain}`, limits.perDomainPerDay],
        [`e:${input.email}`, limits.perEmailPerDay]
      ];
      if (input.ipHash) keys.push([`i:${input.ipHash}`, limits.perIpPerDay]);

      for (const [key, max] of keys) {
        if (recent(key, now).length >= max) return false;
      }
      for (const [key] of keys) hits.set(key, [...recent(key, now), now]);
      return true;
    }
  };
}
