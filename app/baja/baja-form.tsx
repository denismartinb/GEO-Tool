"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { setEmailPreferenceFromLink } from "./actions";

type Props = { userId: string; category: string; token: string; noun: string };

/**
 * EMAIL-UNSUB-1 (log §232), approved design in
 * `docs/design-reference/lifecycle-emails-1/`: a confirm step (link scanners
 * open URLs on their own, so arriving here must never unsubscribe anyone),
 * then a done state that can be undone in place.
 */
export function BajaForm({ userId, category, token, noun }: Props) {
  const [unsubscribed, setUnsubscribed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const apply = (enabled: boolean) => {
    setError(null);
    startTransition(async () => {
      const result = await setEmailPreferenceFromLink({ userId, category, token }, enabled);
      if (result.success) setUnsubscribed(!enabled);
      else setError(result.error);
    });
  };

  if (unsubscribed) {
    return (
      <>
        <div className="baja-ok" aria-hidden="true">
          ✓
        </div>
        <h1 className="auth-title">Hecho. No volverás a recibir {noun}.</h1>
        <p className="auth-sub">El cambio ya está aplicado. Si ha sido sin querer, puedes deshacerlo.</p>
        {error ? <p className="feedback error">{error}</p> : null}
        <Button type="button" variant="outline" className="w-full auth-btn" disabled={pending} onClick={() => apply(true)}>
          Volver a suscribirme
        </Button>
      </>
    );
  }

  return (
    <>
      <h1 className="auth-title">¿Dejar de recibir {noun}?</h1>
      <p className="auth-sub">
        Seguirás recibiendo los emails de tu cuenta: seguridad, pagos y cambios de plan.
      </p>
      {error ? <p className="feedback error">{error}</p> : null}
      <Button type="button" className="w-full auth-btn" disabled={pending} onClick={() => apply(false)}>
        Confirmar baja
      </Button>
      <p className="auth-alt">
        ¿Prefieres elegir qué recibes? <Link href="/dashboard/settings#avisos">Gestionar mis preferencias</Link>
      </p>
    </>
  );
}
