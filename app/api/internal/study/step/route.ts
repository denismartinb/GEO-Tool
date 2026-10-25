import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthorizedInternalRequest } from "@/lib/api/internal-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { reserveStudyApiUnits } from "@/lib/studies/study-api-cap";
import { ENGINES } from "@/lib/studies/sector-study";
import { runStudyStep } from "@/lib/studies/study-engine";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * STUDY-API-1 — one study step (one question × engines × one sample) for a
 * caller without a browser session. Same engine as `/admin/estudio`
 * (`lib/studies/study-engine.ts`), which re-validates the spec; this route
 * only adds the secret and the daily ceiling, reserved per engine BEFORE
 * spending. Nothing is persisted beyond the ceiling rows.
 */
const bodySchema = z.object({
  spec: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("sector"), sectorId: z.string().min(1).max(80) }),
    z.object({
      kind: z.literal("custom"),
      domain: z.string().min(1).max(255),
      brand: z.string().max(80).optional(),
      prompts: z.array(z.string()).max(20),
      competitors: z.array(z.string()).max(15)
    })
  ]),
  engines: z.array(z.enum(ENGINES)).min(1).max(ENGINES.length),
  promptIndex: z.number().int().min(0),
  sample: z.number().int().min(1).max(3)
});

export async function POST(request: Request) {
  // STUDY-API-1: its own secret, never CRON_SECRET (rotating one must not
  // break the other). Fail-closed: an unset variable lets nobody in.
  if (!isAuthorizedInternalRequest(request, process.env.STUDY_API_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const input = parsed.data;

  const engines = [...new Set(input.engines)];
  const reservation = await reserveStudyApiUnits(createServiceClient(), {
    units: engines.length,
    label: input.spec.kind === "sector" ? `sector:${input.spec.sectorId}` : input.spec.domain
  });
  if (!reservation.allowed) return NextResponse.json({ error: reservation.reason }, { status: 429 });

  try {
    const answers = await runStudyStep({ ...input, engines });
    return NextResponse.json({ answers });
  } catch (error) {
    // The engine throws only its own validation codes (`unknown_sector`,
    // `bad_prompt_index`, …): never a provider message.
    return NextResponse.json({ error: error instanceof Error ? error.message : "study_failed" }, { status: 422 });
  }
}
