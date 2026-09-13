"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { useSessionUser } from "@/lib/use-session-user";

/**
 * PRECIO-BUTTONS-CONSOLE-1 (Fase 1): for a logged-in visitor, the plan CTA on
 * the public `/pricing` page has to land on the console's own "Cambiar de
 * plan" modal — the one place that already knows the account's real trial
 * eligibility and quotes the price it would actually be charged — instead of
 * `/signup`, which just restarts an onboarding this account already
 * completed.
 *
 * Reads the session with `useSessionUser`, not a server check, on purpose:
 * `/pricing` is otherwise a fully static, prerendered page (see the
 * `revalidate = 3600` comment in `app/pricing/page.tsx`), and this is the
 * same client-side pattern `PublicHeader` already uses for exactly this
 * reason (`lib/use-session-user.ts`). `null` briefly means "anonymous, or not
 * resolved yet" — the anonymous `/signup` link is the correct default for
 * that instant, same trade-off `useSessionUser` already documents.
 */
export function PlanCardCta({
  planId,
  cta,
  className,
  primary
}: {
  planId: string;
  cta: string;
  className: string;
  primary: boolean;
}) {
  const user = useSessionUser();
  const href = user
    ? `/dashboard/settings?openPlan=${planId}#plan`
    : `/signup?plan=${planId}`;

  return (
    <Link className={className} href={href}>
      {cta}
      {primary ? <Icon name="arrRight" size={15} /> : null}
    </Link>
  );
}
