import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthorizedInternalRequest } from "@/lib/api/internal-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { reserveStudyApiUnits } from "@/lib/studies/study-api-cap";
import { prepareBrandStudyCore } from "@/lib/studies/study-engine";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * STUDY-API-1 — "Preparar con IA" for one brand (business profile,
 * competitors, questions, optionally local to a zone), same engine as
 * `/admin/estudio`. Returned for the caller to review, never run straight
 * into a study, never persisted.
 */
const bodySchema = z.object({
  domain: z.string().min(1).max(255),
  brand: z.string().max(80).optional(),
  promptCount: z.number().int().min(5).max(20).default(10),
  zone: z.string().max(60).optional()
});

/**
 * Profile + competitors + service questions + local and fill-up questions:
 * up to five provider calls, reserved as five units so the ceiling never
 * under-counts.
 */
const PREPARE_UNITS = 5;

export async function POST(request: Request) {
  // STUDY-API-1: its own secret, never CRON_SECRET (rotating one must not
  // break the other). Fail-closed: an unset variable lets nobody in.
  if (!isAuthorizedInternalRequest(request, process.env.STUDY_API_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const reservation = await reserveStudyApiUnits(createServiceClient(), {
    units: PREPARE_UNITS,
    label: parsed.data.domain
  });
  if (!reservation.allowed) return NextResponse.json({ error: reservation.reason }, { status: 429 });

  const result = await prepareBrandStudyCore(parsed.data);
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
