import { z } from "zod";
import { DISPOSABLE_EMAIL_DOMAINS, MIN_FILL_MS, type RequestLimits } from "@/lib/free-report/request";

/**
 * AFFILIATES-1 — the «Quiero ser afiliado» application.
 *
 * Same shape as the free-report request (`lib/free-report/request.ts`) on
 * purpose: a visitor leaves three fields, the operator gets an email, the
 * founder approves by hand and adds the code to `AFFILIATE_CODES`. Nothing is
 * stored, so there is no migration; the operator email IS the record.
 *
 * Pure on purpose (no `server-only`): importable from Vitest.
 */

/** Field names are the form's contract with the action — do not rename. */
export const AFFILIATE_FIELDS = {
  name: "name",
  email: "email",
  channel: "channel",
  /** Honeypot: hidden from people, filled by naive bots. */
  website: "website",
  /** Epoch ms when the form was rendered; a too-fast submit is a bot. */
  renderedAt: "rendered_at",
  /** utm_source/utm_campaign the page was opened with, for the operator. */
  source: "source"
} as const;

const RawSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().max(254).email(),
  channel: z.string().trim().min(3).max(200)
});

export type AffiliateApplication = {
  name: string;
  email: string;
  /** Their web, newsletter or profile, as they wrote it (one line). */
  channel: string;
};

export type AffiliateFieldError = "name" | "email" | "email_disposable" | "channel";

export type AffiliateParseResult =
  | { ok: true; application: AffiliateApplication }
  | { ok: false; kind: "invalid"; field: AffiliateFieldError }
  /** Honeypot filled. Answered like a success, never explained. */
  | { ok: false; kind: "bot" }
  /** Sent before the form finished loading; asked to send it again, never a fake «recibido». */
  | { ok: false; kind: "too_fast" };

export const AFFILIATE_FIELD_ERROR_MESSAGES: Record<AffiliateFieldError, string> = {
  name: "Escribe tu nombre o el de tu agencia.",
  email: "Revisa el email: necesitamos uno al que podamos escribirte.",
  email_disposable: "Este correo parece temporal. Usa uno que leas a menudo para que te llegue tu enlace.",
  channel: "Dinos dónde hablas de búsqueda o IA: tu web, tu newsletter o tu perfil."
};

/** One per day per channel; the operator reads every application anyway. */
export const AFFILIATE_REQUEST_LIMITS: RequestLimits = { perIpPerDay: 3, perDomainPerDay: 1, perEmailPerDay: 2 };

function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

const oneLine = (value: string) => value.replace(/\s+/g, " ").trim();

export function parseAffiliateForm(formData: FormData, now: number): AffiliateParseResult {
  const renderedAtRaw = Number(readString(formData, AFFILIATE_FIELDS.renderedAt));
  const renderedAt = Number.isFinite(renderedAtRaw) ? renderedAtRaw : 0;

  // Bots first: a filled honeypot must not learn which of its fields was wrong.
  if (readString(formData, AFFILIATE_FIELDS.website).trim() !== "") return { ok: false, kind: "bot" };
  if (!renderedAt || now - renderedAt < MIN_FILL_MS) return { ok: false, kind: "too_fast" };

  const parsed = RawSchema.safeParse({
    name: oneLine(readString(formData, AFFILIATE_FIELDS.name)),
    email: readString(formData, AFFILIATE_FIELDS.email),
    channel: oneLine(readString(formData, AFFILIATE_FIELDS.channel))
  });
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return { ok: false, kind: "invalid", field: field === "name" ? "name" : field === "channel" ? "channel" : "email" };
  }

  const emailDomain = parsed.data.email.split("@")[1] ?? "";
  if (DISPOSABLE_EMAIL_DOMAINS.has(emailDomain)) {
    return { ok: false, kind: "invalid", field: "email_disposable" };
  }

  return { ok: true, application: parsed.data };
}

/**
 * A code the operator can approve as-is: built from the channel's host when
 * it looks like a web address, else from the name. Only a suggestion in the
 * operator email — the founder picks the real one.
 */
export function suggestAffiliateCode(application: Pick<AffiliateApplication, "name" | "channel">): string {
  const slug = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/g, "");

  const hostMatch = application.channel
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .match(/^([a-z0-9-]+)\.[a-z.]{2,}(?:[/?#].*)?$/);
  const fromHost = hostMatch ? slug(hostMatch[1]) : "";
  if (fromHost.length >= 2) return fromHost;
  const fromName = slug(application.name);
  return fromName.length >= 2 ? fromName : "afiliado";
}
