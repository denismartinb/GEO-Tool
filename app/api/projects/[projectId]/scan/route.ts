import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getActionErrorCode, getSanitizedScanError, launchScan } from "@/lib/scan/scan-runner";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ projectId: z.string().uuid() });

export async function POST(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_project_id" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await launchScan({ projectId: parsed.data.projectId, supabase, user });
    return NextResponse.json({ runId: result.runId, executed: result.executed });
  } catch (error) {
    return NextResponse.json(
      { error: getActionErrorCode(error), message: getSanitizedScanError(error) },
      { status: 422 }
    );
  }
}
