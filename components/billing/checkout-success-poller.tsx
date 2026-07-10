"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Stripe's webhook can take a few seconds to arrive after the browser is
 * redirected back from Checkout — without this, "Pago completado" sits next
 * to the old (pre-payment) plan until the owner manually reloads. Polls
 * `router.refresh()` (re-fetches this server component tree, including
 * `getUsageSummary()`) every 2s while `pending`, so the real plan/trial
 * state appears as soon as the webhook has actually processed. Stops on its
 * own once the caller passes `pending={false}` (the new server-rendered
 * props reflect the update) or after ~20s regardless, so a webhook that
 * never arrives doesn't poll forever.
 */
export function CheckoutSuccessPoller({ pending }: { pending: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!pending) return;

    const interval = setInterval(() => router.refresh(), 2000);
    const stop = setTimeout(() => clearInterval(interval), 20000);

    return () => {
      clearInterval(interval);
      clearTimeout(stop);
    };
  }, [pending, router]);

  return null;
}
