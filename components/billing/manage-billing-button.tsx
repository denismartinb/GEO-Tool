"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { createPortalSession } from "@/app/dashboard/settings/billing/actions";

/** BILLING-STRIPE-1 PR 2: opens the real Stripe Customer Portal — payment method, invoice history, cancellation. */
export function ManageBillingButton() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    setError(null);
    startTransition(async () => {
      const result = await createPortalSession();
      if (result.success) {
        window.location.href = result.url;
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <>
      <Button type="button" variant="outline" disabled={isPending} onClick={handleClick}>
        <Icon name="card" size={14} />
        {isPending ? "Abriendo portal…" : "Gestionar facturación"}
      </Button>
      {error && (
        <p className="feedback error" style={{ marginTop: 10 }}>
          {error}
        </p>
      )}
    </>
  );
}
