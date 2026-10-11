import { AFFILIATE_REF_PARAM, normalizeAffiliateCode, parseAffiliateCodes } from "@/lib/affiliates/codes";

/**
 * AFFILIATES-ADMIN-1 — the operator's view of the affiliate programme
 * (`/admin/afiliados`): which codes are active, how many accounts each one
 * brought, and the links to hand an affiliate.
 *
 * Read-only on purpose. The codes still live only in `AFFILIATE_CODES`
 * (Vercel), so "add a code" stays a Vercel edit plus a redeploy; this page
 * never writes anything. Pure: the page injects the env value, the accounts
 * and the site URL.
 */

/** Pages an affiliate can link to. Any page works (`middleware.ts`); these are the useful ones. */
export const AFFILIATE_LANDINGS = [
  { id: "portada", label: "Portada", path: "/" },
  { id: "precios", label: "Precios", path: "/precios" },
  { id: "comprobador", label: "Comprobador gratis", path: "/gratis/aparece-mi-marca-en-chatgpt" },
  { id: "informe", label: "Informe gratis", path: "/gratis/informe-geo" }
] as const;

export type AffiliateLanding = (typeof AFFILIATE_LANDINGS)[number];

/** Every affiliate link is tagged so PostHog can split it from other traffic. */
export const AFFILIATE_UTM_MEDIUM = "afiliado";

/** "Octubre LinkedIn" → "octubre-linkedin". Empty or unusable input gives null. */
export function normalizeCampaign(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const slug = raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  return slug === "" ? null : slug;
}

/**
 * `https://www.genscore.es/precios?ref=code&utm_source=code&utm_medium=afiliado`.
 * `ref` goes first: it is the part that pays the affiliate, so it should
 * survive anyone trimming the tail of a long link by hand.
 */
export function buildAffiliateShareUrl(input: {
  siteUrl: string;
  code: string;
  path: string;
  campaign?: string | null;
}): string {
  const base = input.siteUrl.trim().replace(/\/+$/, "");
  const params = new URLSearchParams();
  params.set(AFFILIATE_REF_PARAM, input.code);
  params.set("utm_source", input.code);
  params.set("utm_medium", AFFILIATE_UTM_MEDIUM);
  const campaign = normalizeCampaign(input.campaign);
  if (campaign) params.set("utm_campaign", campaign);
  const path = input.path === "/" ? "/" : `/${input.path.replace(/^\/+/, "")}`;
  return `${base}${path}?${params.toString()}`;
}

export type AffiliateAccount = {
  referralCode: unknown;
  /** Same rule as the Usuarios table: a Stripe subscription id means paid. */
  paid: boolean;
};

export type AffiliateCodeRow = {
  code: string;
  /** Listed in `AFFILIATE_CODES` today. A retired code can still have accounts. */
  active: boolean;
  signups: number;
  paid: number;
};

/**
 * One row per active code (even with no accounts yet) plus one per retired
 * code that still has accounts attributed. Active first, then by sign-ups.
 */
export function summarizeAffiliateCodes(envValue: string | null | undefined, accounts: AffiliateAccount[]): AffiliateCodeRow[] {
  const active = parseAffiliateCodes(envValue);
  const rows = new Map<string, AffiliateCodeRow>();
  for (const code of active) rows.set(code, { code, active: true, signups: 0, paid: 0 });

  for (const account of accounts) {
    const code = normalizeAffiliateCode(typeof account.referralCode === "string" ? account.referralCode : null);
    if (!code) continue;
    const row = rows.get(code) ?? { code, active: false, signups: 0, paid: 0 };
    row.signups += 1;
    if (account.paid) row.paid += 1;
    rows.set(code, row);
  }

  return [...rows.values()].sort(
    (a, b) => Number(b.active) - Number(a.active) || b.signups - a.signups || a.code.localeCompare(b.code)
  );
}
