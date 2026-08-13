import { redirect } from "next/navigation";
import { BrandLogo } from "@/components/ui/brand-logo";
import { requireOperatorCandidate } from "@/lib/admin/operator";
import { safeAdminNext } from "@/lib/admin/safe-next";
import { verifyChallenge } from "./actions";

/**
 * ADMIN-CONSOLE-1. Elevates an already-enrolled operator session to `aal2`.
 * Reached from `requireOperator()` whenever a verified TOTP factor already
 * exists but the current session predates it (or predates today's login).
 */
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
    <main className="auth-bg">
      <div className="auth-card fade-in" style={{ maxWidth: 400 }}>
        <div className="auth-logo">
          <BrandLogo size={24} />
        </div>

        <div className="auth-h1">Verifica tu identidad</div>
        <div className="auth-sub">Introduce el código de 6 dígitos de tu app de autenticación.</div>

        {params.error ? (
          <p className="feedback error" style={{ marginTop: 20 }}>
            {params.error}
          </p>
        ) : null}

        <form action={verifyChallenge} className="auth-form" style={{ marginTop: 20 }}>
          <input type="hidden" name="factorId" value={factor.id} />
          <input type="hidden" name="next" value={next} />
          <div>
            <label className="field-label" htmlFor="code">
              Código de 6 dígitos
            </label>
            <input
              id="code"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              autoFocus
              className="field"
              placeholder="000000"
              style={{ letterSpacing: "0.3em", textAlign: "center", fontVariantNumeric: "tabular-nums" }}
            />
          </div>
          <button type="submit" className="btn btn-primary auth-btn">
            Verificar
          </button>
        </form>
      </div>
    </main>
  );
}
