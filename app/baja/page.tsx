import Link from "next/link";
import type { Metadata } from "next";
import { BrandLogo } from "@/components/ui/brand-logo";
import { CATEGORY_COPY, isOptionalEmailCategory } from "@/lib/email/categories";
import { verifyUnsubscribeToken } from "@/lib/email/unsubscribe";
import { BajaForm } from "./baja-form";

/**
 * EMAIL-UNSUB-1 (log §232). Where the "Darme de baja" link of every optional
 * email lands. Public and sessionless on purpose: unsubscribing must never
 * require logging in. The token is checked here only to decide what to
 * render — the write re-checks it (`./actions.ts`).
 */
export const metadata: Metadata = {
  title: "Preferencias de email — GenScore",
  robots: { index: false, follow: false }
};

export default async function BajaPage({
  searchParams
}: {
  searchParams: Promise<{ u?: string; c?: string; t?: string }>;
}) {
  const { u, c, t } = await searchParams;
  const valid = isOptionalEmailCategory(c) && verifyUnsubscribeToken({ userId: u, category: c, token: t });

  return (
    <main className="auth-bg">
      <div className="auth-card baja-card">
        <div className="auth-logo">
          <BrandLogo size={24} />
        </div>
        {valid ? (
          <BajaForm userId={u as string} category={c} token={t as string} noun={CATEGORY_COPY[c].noun} />
        ) : (
          <>
            <h1 className="auth-title">Este enlace no es válido</h1>
            <p className="auth-sub">
              Puede que esté incompleto. Puedes elegir qué emails recibes desde{" "}
              <Link href="/dashboard/settings#avisos">Ajustes → Notificaciones</Link>, o escribirnos a
              soporte@genscore.es y te damos de baja nosotros.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
