"use server";

import { headers } from "next/headers";
import { clientIpFromHeaders, hashIp } from "@/lib/free-checker/rate-limit";
import { createRequestLimiter, readSource } from "@/lib/free-report/request";
import { AFFILIATE_REQUEST_LIMITS } from "@/lib/affiliates/request";
import { sendAffiliateConfirmationEmail, sendAffiliateOpsEmail } from "@/lib/affiliates/emails";
import { submitAffiliateApplicationCore, type AffiliateApplyState } from "@/lib/affiliates/submit";

/** Module scope: lives as long as the server instance. See `createRequestLimiter`. */
const limiter = createRequestLimiter(AFFILIATE_REQUEST_LIMITS);

const LOG_PREFIX = "[geo:affiliates]";

/**
 * AFFILIATES-1. A thin translation of `submitAffiliateApplicationCore` for
 * `useActionState`; every decision lives in the core (validation with zod
 * included, `lib/affiliates/request.ts`).
 */
export async function applyAsAffiliate(_prev: AffiliateApplyState, formData: FormData): Promise<AffiliateApplyState> {
  const requestHeaders = await headers();
  const ip = clientIpFromHeaders(requestHeaders);
  let ipHash: string | null = null;
  try {
    ipHash = ip ? hashIp(ip, process.env.PUBLIC_CHECK_IP_SALT) : null;
  } catch {
    ipHash = null;
  }

  return submitAffiliateApplicationCore(formData, {
    now: Date.now,
    ipHash,
    source: readSource(formData),
    limiter,
    sendOps: sendAffiliateOpsEmail,
    sendConfirmation: sendAffiliateConfirmationEmail,
    log: (event, detail) => console.warn(`${LOG_PREFIX} ${event}`, detail ?? {})
  });
}
