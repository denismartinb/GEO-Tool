import { z } from "zod";
import { cleanDomain, isWellFormedDomain } from "@/lib/projects/project-form";
import { DISPOSABLE_EMAIL_DOMAINS, MIN_FILL_MS } from "@/lib/free-report/request";
import { findOfferedSlot, type DemoSlot } from "@/lib/demo/slots";

/**
 * DEMO-CALL-1 — the «Agenda una videollamada» request.
 *
 * Same shape as the free-report request (`lib/free-report/request.ts`, log
 * §249): no migration, no calendar API. The request reaches the operator by
 * email, he sends the invitation by hand. The spam guards are the same ones,
 * imported rather than copied.
 */

/** Field names are the form's contract with the action — do not rename. */
export const DEMO_FIELDS = {
  name: "name",
  email: "email",
  domain: "domain",
  slot: "slot",
  topic: "topic",
  /** Honeypot: hidden from people, filled by naive bots. */
  website: "website",
  renderedAt: "rendered_at",
  source: "source"
} as const;

export type DemoRequest = {
  name: string;
  email: string;
  domain: string;
  slot: DemoSlot;
  /** Optional: what they want to see. One line, empty when not given. */
  topic: string;
};

export type DemoFieldError = "name" | "email" | "email_disposable" | "domain" | "slot" | "slot_missing";

export type DemoParseResult =
  | { ok: true; request: DemoRequest }
  | { ok: false; kind: "invalid"; field: DemoFieldError }
  | { ok: false; kind: "bot" }
  | { ok: false; kind: "too_fast" };

export const DEMO_FIELD_ERROR_MESSAGES: Record<DemoFieldError, string> = {
  name: "Dinos tu nombre para saber a quién saludar.",
  email: "Revisa el email: ahí te enviaremos la invitación.",
  email_disposable: "Este correo parece temporal. Usa el de tu empresa para que la invitación te llegue.",
  domain: "Escribe la dirección de tu web, por ejemplo tuempresa.es.",
  slot: "Ese hueco ya no está disponible. Elige otro, por favor.",
  slot_missing: "Elige un día y una hora para la videollamada."
};

const RawSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().max(254).email(),
  topic: z.string().max(300)
});

function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export function parseDemoForm(formData: FormData, now: number): DemoParseResult {
  const renderedAtRaw = Number(readString(formData, DEMO_FIELDS.renderedAt));
  const renderedAt = Number.isFinite(renderedAtRaw) ? renderedAtRaw : 0;

  if (readString(formData, DEMO_FIELDS.website).trim() !== "") return { ok: false, kind: "bot" };
  if (!renderedAt || now - renderedAt < MIN_FILL_MS) return { ok: false, kind: "too_fast" };

  const slotId = readString(formData, DEMO_FIELDS.slot).trim();
  if (!slotId) return { ok: false, kind: "invalid", field: "slot_missing" };
  const slot = findOfferedSlot(slotId, new Date(now));
  if (!slot) return { ok: false, kind: "invalid", field: "slot" };

  const parsed = RawSchema.safeParse({
    name: readString(formData, DEMO_FIELDS.name),
    email: readString(formData, DEMO_FIELDS.email),
    topic: readString(formData, DEMO_FIELDS.topic)
  });
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return { ok: false, kind: "invalid", field: field === "name" ? "name" : "email" };
  }

  const domain = cleanDomain(readString(formData, DEMO_FIELDS.domain));
  if (!isWellFormedDomain(domain)) return { ok: false, kind: "invalid", field: "domain" };

  if (DISPOSABLE_EMAIL_DOMAINS.has(parsed.data.email.split("@")[1] ?? "")) {
    return { ok: false, kind: "invalid", field: "email_disposable" };
  }

  return {
    ok: true,
    request: {
      // One line each: both end up in an email subject or table row.
      name: parsed.data.name.replace(/\s+/g, " "),
      email: parsed.data.email,
      domain,
      slot,
      topic: parsed.data.topic.replace(/\s+/g, " ").trim()
    }
  };
}
