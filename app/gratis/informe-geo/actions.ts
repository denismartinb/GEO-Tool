"use server";

import { headers } from "next/headers";
import { clientIpFromHeaders, hashIp } from "@/lib/free-checker/rate-limit";
import { sendFreeReportConfirmationEmail, sendFreeReportOpsEmail } from "@/lib/free-report/emails";
import { createRequestLimiter, readSource } from "@/lib/free-report/request";
import { submitFreeReportCore, type FreeReportState } from "@/lib/free-report/submit";

/** Module scope: lives as long as the server instance. See `createRequestLimiter`. */
const limiter = createRequestLimiter();

const LOG_PREFIX = "[geo:free-report]";

/**
 * FREE-REPORT-1 Fase 1. A thin translation of `submitFreeReportCore` for
 * `useActionState`; every decision lives in the core.
 */
export async function requestFreeReport(_prev: FreeReportState, formData: FormData): Promise<FreeReportState> {
  const requestHeaders = await headers();
  const ip = clientIpFromHeaders(requestHeaders);
  let ipHash: string | null = null;
  try {
    // Without the salt the IP is simply not counted: the domain and email
    // limits still apply, and this phase spends no money.
    ipHash = ip ? hashIp(ip, process.env.PUBLIC_CHECK_IP_SALT) : null;
  } catch {
    ipHash = null;
  }

  return submitFreeReportCore(formData, {
    now: Date.now,
    ipHash,
    source: readSource(formData),
    limiter,
    sendOps: sendFreeReportOpsEmail,
    sendConfirmation: sendFreeReportConfirmationEmail,
    log: (event, detail) => console.warn(`${LOG_PREFIX} ${event}`, detail ?? {})
  });
}
