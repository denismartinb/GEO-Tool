"use client";

import { useEffect } from "react";
import { writeCachedSessionUser } from "@/lib/use-session-user";

/**
 * header-flicker-prehydration-2 (2026-09-19, founder-reported). The console
 * side of the public header's identity cache (`lib/use-session-user.ts` —
 * read that file's header comment first; this component only feeds it).
 *
 * Why the console writes a cache the console never reads: that cache is the
 * only thing standing between a logged-in visitor and a flash of the
 * anonymous "Iniciar sesión / Prueba gratis" CTAs on a public page, and until
 * now the only thing that ever wrote it was a public page itself. So the
 * first public surface a freshly logged-in visitor opened was a guaranteed
 * cache miss — you log in, land in the console, click "Manuales GEO" in the
 * sidebar, and that blog page flickers by construction, every time, for every
 * new account. Here the identity is already resolved server-side (the layout
 * has it for the sidebar chip), so seeding costs nothing: no request, no
 * round trip, one `localStorage` write.
 *
 * It is a hint, not a grant — same contract as every other writer. `/api/me`
 * still runs on every public page load and still overwrites whatever it finds
 * here, so a value written by this component can only ever decide what gets
 * painted for the moment that answer takes to arrive.
 *
 * Renders nothing, on purpose: it is a side effect with a mount point, not
 * UI, and nothing in the console may shift by a pixel because of it.
 */
export function SessionCacheSync({
  email,
  planId,
  planName
}: {
  email: string;
  planId: string;
  planName: string;
}) {
  useEffect(() => {
    writeCachedSessionUser({ email, planId, planName });
  }, [email, planId, planName]);

  return null;
}

/**
 * Sign-out, with the cache above cleared first.
 *
 * Without this the hint outlives the session that justified it: the server
 * action clears the auth cookies and redirects, but `localStorage` — unlike
 * the per-tab `sessionStorage` this replaced — survives that, so the next
 * public page would paint the skeleton and then the old account's chip until
 * `/api/me` came back saying nobody is logged in. Nothing is leaked (the
 * cache holds only what that same browser already displayed, and the chip
 * grants no access), but showing a signed-out person their own email for half
 * a second is the exact "un producto que no sabe quién está mirando" defect
 * this whole line of work exists to remove.
 *
 * `onSubmit` rather than an action wrapper: the write is synchronous and
 * local, so it completes before the browser hands the submission over, and
 * the server action stays untouched — sign-out must not become something
 * that can fail in the client.
 */
export function SignOutForm({
  action,
  className,
  children
}: {
  action: () => Promise<void>;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <form action={action} className={className} onSubmit={() => writeCachedSessionUser(null)}>
      {children}
    </form>
  );
}
