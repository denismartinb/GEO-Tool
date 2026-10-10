"use server";

import { headers } from "next/headers";
import { clientIpFromHeaders, hashIp } from "@/lib/free-checker/rate-limit";
import { sendDemoConfirmationEmail, sendDemoOpsEmail } from "@/lib/demo/emails";
import { createRequestLimiter, readSource } from "@/lib/free-report/request";
import { DEMO_REQUEST_LIMITS, submitDemoCore, type DemoState } from "@/lib/demo/submit";

/** Module scope: lives as long as the server instance. See `createRequestLimiter`. */
const limiter = createRequestLimiter(DEMO_REQUEST_LIMITS);

const LOG_PREFIX = "[geo:demo]";

/** DEMO-CALL-1. A thin translation of `submitDemoCore` for `useActionState`. */
export async function requestDemoCall(_prev: DemoState, formData: FormData): Promise<DemoState> {
  const requestHeaders = await headers();
  const ip = clientIpFromHeaders(requestHeaders);
  let ipHash: string | null = null;
  try {
    ipHash = ip ? hashIp(ip, process.env.PUBLIC_CHECK_IP_SALT) : null;
  } catch {
    ipHash = null;
  }

  return submitDemoCore(formData, {
    now: Date.now,
    ipHash,
    source: readSource(formData),
    limiter,
    sendOps: sendDemoOpsEmail,
    sendConfirmation: sendDemoConfirmationEmail,
    log: (event, detail) => console.warn(`${LOG_PREFIX} ${event}`, detail ?? {})
  });
}
