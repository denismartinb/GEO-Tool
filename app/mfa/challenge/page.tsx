import { redirect } from "next/navigation";
import type { Metadata } from "next";
import "@/app/ins/tokens.css";
import "@/app/ins/components.css";
import "@/app/ins/auth.css";
import { AuthHead, AuthPage } from "@/components/ins/auth/page";
import { OtpInput, SubmitButton } from "@/components/ins/auth/parts";
import { Ic } from "@/components/ins/ic";
import { signOut } from "@/app/dashboard/actions";
import { requireOperatorCandidate } from "@/lib/admin/operator";
import { safeAdminNext } from "@/lib/admin/safe-next";
import { consoleMetadata } from "@/lib/seo/console-metadata";
import { verifyChallenge } from "./actions";

/**
 * ADMIN-CONSOLE-1. Elevates an already-enrolled operator session to `aal2`.
 * Reached from `requireOperator()` whenever a verified TOTP factor already
 * exists but the current session predates it (or predates today's login).
 */
// ROOT-METADATA-1: pestaña propia. Ver `lib/seo/console-metadata.ts`.
export const metadata: Metadata = consoleMetadata("Verificación en dos pasos");

export default async function MfaChallengePage({
  searchParams
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = safeAdminNext(params.next);

  const { supabase } = await requireOperatorCandidate();

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === "aal2") redirect(next);

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = (factors?.totp ?? []).find((f) => f.status === "verified");
  if (!factor) redirect("/mfa/enroll");

  return (
    <AuthPage lit={1}>
      <AuthHead title="Verifica tu identidad">El código de 6 dígitos de tu app de autenticación.</AuthHead>
      {params.error ? (
        <div className="au-fail" role="alert">
          <Ic n="warn" sm />
          {params.error}
        </div>
      ) : null}
      <form action={verifyChallenge} className="au-step-form">
        <input type="hidden" name="factorId" value={factor.id} />
        <input type="hidden" name="next" value={next} />
        <OtpInput name="code" label="Código de verificación" />
        <SubmitButton pendingLabel="Verificando…">Verificar</SubmitButton>
      </form>
      <form action={signOut} className="au-back">
        <button type="submit">Usar otra cuenta</button>
      </form>
    </AuthPage>
  );
}
