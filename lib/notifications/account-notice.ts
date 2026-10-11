/**
 * NOTIF-LANES-1 (log §297): the «Tu cuenta» lane of the bell. Computed on
 * every load from the profile instead of stored as a row, so the day count is
 * always the real one and nothing needs a cron to keep it current.
 *
 * Pure: the caller passes the effective plan, the trial date, the date of the
 * last completed scan and the founder price (null when no founder places are
 * left, so the notice never offers a price checkout would refuse).
 */
import type { RenderedNotification } from "@/lib/notifications/render";

const DAY_MS = 24 * 60 * 60 * 1000;

export type AccountNotice =
  | { kind: "trial"; daysLeft: number; lastDay: boolean; founderPrice: number | null }
  | { kind: "read_only"; daysSinceScan: number | null; founderPrice: number | null };

export type AccountNoticeInput = {
  /** Effective plan id (trial expiry and comped already applied). */
  planId: string;
  trialEndsAt: string | null;
  hasSubscription: boolean;
  lastCompletedScanAt: string | null;
  founderPrice: number | null;
  now: number;
};

export function buildAccountNotice(input: AccountNoticeInput): AccountNotice | null {
  const { planId, trialEndsAt, hasSubscription, lastCompletedScanAt, founderPrice, now } = input;

  if (planId === "pro" && trialEndsAt && !hasSubscription) {
    const remaining = Date.parse(trialEndsAt) - now;
    if (!Number.isFinite(remaining) || remaining <= 0) return null;
    return {
      kind: "trial",
      daysLeft: Math.ceil(remaining / DAY_MS),
      lastDay: remaining <= DAY_MS,
      founderPrice
    };
  }

  if (planId === "free") {
    const scannedAt = lastCompletedScanAt ? Date.parse(lastCompletedScanAt) : NaN;
    return {
      kind: "read_only",
      daysSinceScan: Number.isFinite(scannedAt) ? Math.max(0, Math.floor((now - scannedAt) / DAY_MS)) : null,
      founderPrice
    };
  }

  return null;
}

/** Same deep link «Cambiar de plan» already accepts (log §221). */
export const ACCOUNT_NOTICE_HREF = "/dashboard/settings?openPlan=pro#plan";

export type RenderedAccountNotice = RenderedNotification & {
  /** Red and counted in the bell dot. Only the last trial day, so a whole week of red is never shown. */
  urgent: boolean;
  cta: string;
};

function founderLine(price: number | null): string {
  return price !== null ? ` Con precio fundador, Pro se queda en ${price} € al mes para siempre.` : "";
}

export function renderAccountNotice(notice: AccountNotice): RenderedAccountNotice {
  if (notice.kind === "trial") {
    if (notice.lastDay) {
      return {
        title: "Último día de tu prueba de Pro",
        body: `Cuando acabe, tu Puntuación GEO deja de actualizarse.${founderLine(notice.founderPrice)}`,
        targetLabel: null,
        href: ACCOUNT_NOTICE_HREF,
        icon: "alertCircle",
        tone: "neg",
        urgent: true,
        cta: "Mantener Pro"
      };
    }
    return {
      title: `Te quedan ${notice.daysLeft} días de Pro`,
      body: `Después tu cuenta pasa a solo lectura y deja de escanear.${founderLine(notice.founderPrice)}`,
      targetLabel: null,
      href: ACCOUNT_NOTICE_HREF,
      icon: "clock",
      tone: "warm",
      urgent: false,
      cta: "Ver planes"
    };
  }

  const days = notice.daysSinceScan;
  return {
    title:
      days !== null && days >= 1
        ? `Tu puntuación lleva ${days} ${days === 1 ? "día" : "días"} sin actualizarse`
        : "Tu cuenta está en solo lectura",
    body:
      days !== null
        ? `La IA cambia sus respuestas y lo que ves es de tu último escaneo. Activa Pro para volver a medir.${founderLine(notice.founderPrice)}`
        : `Activa un plan para escanear tu web.${founderLine(notice.founderPrice)}`,
    targetLabel: null,
    href: ACCOUNT_NOTICE_HREF,
    icon: "clock",
    tone: "warm",
    urgent: false,
    cta: "Activar Pro"
  };
}
