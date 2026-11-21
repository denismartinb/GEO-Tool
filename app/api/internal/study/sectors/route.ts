import "server-only";
import { NextResponse } from "next/server";
import { isAuthorizedInternalRequest } from "@/lib/api/internal-auth";
import { DEFAULT_ENGINES, ENGINES, SECTORS } from "@/lib/studies/sector-study";

export const dynamic = "force-dynamic";

/** STUDY-API-1 — the predefined sectors a caller can run with `kind: "sector"`. No LLM call. */
export async function GET(request: Request) {
  // STUDY-API-1: its own secret, never CRON_SECRET (rotating one must not
  // break the other). Fail-closed: an unset variable lets nobody in.
  if (!isAuthorizedInternalRequest(request, process.env.STUDY_API_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    engines: ENGINES,
    defaultEngines: DEFAULT_ENGINES,
    sectors: SECTORS.map((sector) => ({
      id: sector.id,
      label: sector.label,
      country: sector.country,
      promptCount: sector.prompts.length
    }))
  });
}
