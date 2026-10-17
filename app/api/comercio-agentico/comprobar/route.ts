import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { fetchOnDomain } from "@/lib/agentic-audit/fetch";
import { normalizeTarget, runAgenticAudit } from "@/lib/agentic-audit/run-audit";
import type { AgenticCheckResponse } from "@/lib/agentic-audit/api-contract";
import {
  AGENTIC_CHECK_ENGINE,
  AGENTIC_CHECK_LIMITS,
  checkPublicCheckLimits,
  clientIpFromHeaders,
  hashIp
} from "@/lib/free-checker/rate-limit";
import { resolveAgentTokenAccess } from "@/lib/web-audit/robots";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * AGENTIC-COMMERCE-1 — the free agentic check behind `/comercio-agentico`.
 *
 * No LLM is called. What it spends is outbound requests to a third party's
 * site, so it is rate limited like the ChatGPT checker, in the same table
 * and with its own counters (`AGENTIC_CHECK_ENGINE`), and the row is written
 * BEFORE the requests go out: a check that dies halfway still counts.
 * Every limit fails closed.
 */

const RequestSchema = z.object({ url: z.string().min(1).max(2048) });
const LOG_PREFIX = "[geo:agentic-check]";

function json(body: AgenticCheckResponse, status = 200) {
  return NextResponse.json(body, { status });
}

export async function POST(request: Request) {
  let input: string;
  try {
    input = RequestSchema.parse(await request.json()).url;
  } catch {
    return json({ status: "failed", error: "invalid_url" }, 400);
  }
  const target = normalizeTarget(input);
  if (!target) return json({ status: "failed", error: "invalid_url" }, 400);

  const ip = clientIpFromHeaders(request.headers);
  let ipHash: string;
  try {
    if (!ip) throw new Error("no client ip");
    ipHash = hashIp(ip, process.env.PUBLIC_CHECK_IP_SALT);
  } catch {
    console.error(`${LOG_PREFIX} ip_hash_unavailable`);
    return json({ status: "degraded", reason: "limit_check_failed" });
  }

  let service: ReturnType<typeof createServiceClient>;
  try {
    service = createServiceClient();
  } catch {
    console.error(`${LOG_PREFIX} service_client_unavailable`);
    return json({ status: "degraded", reason: "limit_check_failed" });
  }

  const limits = await checkPublicCheckLimits(
    service,
    { ipHash, domain: target.baseDomain },
    { limits: AGENTIC_CHECK_LIMITS, engine: AGENTIC_CHECK_ENGINE }
  );
  if (!limits.allowed) return json({ status: "degraded", reason: limits.reason });

  const { data: inserted, error: insertError } = await service
    .from("public_checks")
    .insert({ domain: target.baseDomain, ip_hash: ipHash, status: "pending", engine: AGENTIC_CHECK_ENGINE })
    .select("id")
    .single();
  if (insertError || !inserted) {
    console.error(`${LOG_PREFIX} insert_failed`);
    return json({ status: "degraded", reason: "limit_check_failed" });
  }

  const outcome = await runAgenticAudit(target.url, {
    fetch: fetchOnDomain,
    tokenAllowed: resolveAgentTokenAccess
  });

  // A failure here leaves the row `pending`, which still counts: the safe direction.
  await service
    .from("public_checks")
    .update(
      outcome.status === "completed"
        ? { status: "completed", error_category: null }
        : { status: "failed", error_category: outcome.error }
    )
    .eq("id", inserted.id)
    .then(undefined, () => console.error(`${LOG_PREFIX} close_row_failed`));

  if (outcome.status === "failed") return json({ status: "failed", error: outcome.error });
  return json({ status: "completed", ...outcome.result });
}
