import { getIndexNowKey } from "@/lib/seo/indexnow";

/**
 * GEO-SELF-1 Fase 1. The IndexNow key file, declared as `keyLocation` in every
 * ping (`lib/seo/indexnow.ts`). 404 while `INDEXNOW_KEY` is unset or
 * malformed: a key file that answers with nothing would be a claim of
 * ownership we have not configured.
 */
export const dynamic = "force-dynamic";

export function GET() {
  const key = getIndexNowKey();
  if (!key) return new Response("Not found", { status: 404 });
  return new Response(key, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" }
  });
}
