import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isOptionalEmailCategory } from "@/lib/email/categories";
import { setEmailPreferenceAsService, verifyUnsubscribeToken } from "@/lib/email/unsubscribe";

/**
 * EMAIL-UNSUB-1 (log §232). RFC 8058 one-click unsubscribe target — the URL
 * in every optional email's `List-Unsubscribe` header. Gmail, Yahoo and
 * Apple Mail POST here (body `List-Unsubscribe=One-Click`) when the person
 * presses the client's own "Cancelar suscripción" button, and expect the
 * opt-out applied with no further page or confirmation.
 *
 * Identity is the signed token in the query string, not a session: the
 * person pressing that button is not logged in and never will be here.
 * `verifyUnsubscribeToken` binds the token to (account, category), so the
 * service-role write below can change one preference column of one account
 * and nothing else.
 *
 * GET is not an opt-out: link scanners and mail previews fetch URLs on their
 * own, so a GET only redirects to the confirmation page.
 */
function readParams(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const category = params.get("c");
  return { userId: params.get("u"), category, token: params.get("t") };
}

export async function POST(request: NextRequest) {
  const { userId, category, token } = readParams(request);
  if (!isOptionalEmailCategory(category) || !verifyUnsubscribeToken({ userId, category, token })) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const result = await setEmailPreferenceAsService(createServiceClient(), {
    userId: userId as string,
    category,
    enabled: false,
    source: "one_click"
  });

  return NextResponse.json({ ok: result.ok }, { status: result.ok ? 200 : 500 });
}

export async function GET(request: NextRequest) {
  const target = new URL("/baja", request.nextUrl.origin);
  target.search = request.nextUrl.search;
  return NextResponse.redirect(target, 303);
}
