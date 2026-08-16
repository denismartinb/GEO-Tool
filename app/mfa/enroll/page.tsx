import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { BrandLogo } from "@/components/ui/brand-logo";
import { requireOperatorCandidate } from "@/lib/admin/operator";
import { selectTotpFactors } from "@/lib/admin/mfa-factors";
import { consoleMetadata } from "@/lib/seo/console-metadata";
import { verifyEnrollment, regenerateEnrollment } from "./actions";

/**
 * ADMIN-CONSOLE-1. Bootstraps the one hard requirement `requireOperator()`
 * enforces on `/admin`: a verified TOTP factor. Only reachable by the
 * allow-listed operator (`requireOperatorCandidate()` — session + UUID, no
 * `aal2` required yet, since that is exactly what this page exists to grant).
 *
 * The QR code and the plain-text secret are shown ONLY on first enrollment.
 * A wrong code on the next screen does not regenerate them — Supabase never
 * returns a factor's secret a second time, so the retry path re-challenges
 * the SAME pending factor the person already scanned into their app instead
 * of silently asking them to re-scan a new one.
 */
/** Etiqueta que verá el operador en su app de autenticación. */
const TOTP_FRIENDLY_NAME = "GenScore admin";

// ROOT-METADATA-1: pestaña propia. Ver `lib/seo/console-metadata.ts`.
export const metadata: Metadata = consoleMetadata("Configurar verificación en dos pasos");

export default async function MfaEnrollPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const { supabase } = await requireOperatorCandidate();

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === "aal2") redirect("/admin");

  const { data: factors } = await supabase.auth.mfa.listFactors();
  // `selectTotpFactors` lee de `all`, NO de `totp`: `auth-js` sólo mete en
  // `totp` los factores verificados, así que un enrolamiento a medias sólo
  // aparece en `all`. Buscarlo en `totp` dejaba `/admin` inalcanzable para
  // siempre — ver el comentario de `lib/admin/mfa-factors.ts`.
  const { verified, pending } = selectTotpFactors(factors);
  if (verified) redirect("/mfa/challenge");

  let factorId: string | null = pending?.id ?? null;
  let qrCode: string | null = null;
  let secret: string | null = null;
  let enrollError: string | null = null;

  if (!pending) {
    // Con nombre, no en blanco. Sin él, la entrada aparece sin etiqueta en la
    // app de autenticación, y quien acumule varios intentos no puede
    // distinguir cuál es la buena — pasó el 2026-08-13: el código "inválido"
    // que arrancó el bloqueo salió, con toda probabilidad, de una entrada
    // muerta de un intento anterior. Es constante a propósito: el flujo de
    // arriba nunca llama a `enroll()` teniendo ya un factor (verificado
    // redirige al desafío, pendiente se reutiliza), así que no puede chocar
    // consigo mismo.
    const { data: enrolled, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: TOTP_FRIENDLY_NAME
    });
    if (error || !enrolled) {
      console.error("[geo:admin:mfa] failed to start TOTP enrollment", { message: error?.message });
      // Un mensaje que sólo dice "recarga" es inútil cuando recargar no arregla
      // nada: pasó el 2026-08-13 con un factor a medio enrolar, y el operador
      // se quedó mirando una pantalla que le pedía justo lo que no servía. El
      // detalle del proveedor NO se muestra (podría filtrar interioridades),
      // pero sí se nombra lo único accionable que hay.
      enrollError =
        error?.message && /already exists/i.test(error.message)
          ? "Ya hay un doble factor a medio configurar en esta cuenta. Retíralo desde el panel de Supabase (Authentication → Users → tu cuenta → MFA) y vuelve a entrar."
          : "No se pudo generar el código. Si al recargar sigue fallando, revisa que el doble factor por aplicación (TOTP) esté habilitado en Supabase.";
    } else {
      factorId = enrolled.id;
      qrCode = enrolled.totp.qr_code;
      secret = enrolled.totp.secret;
    }
  }

  return (
    <main className="auth-bg">
      <div className="auth-card fade-in" style={{ maxWidth: 440 }}>
        <div className="auth-logo">
          <BrandLogo size={24} />
        </div>

        <div className="auth-h1">Activa el doble factor</div>
        <div className="auth-sub">
          /admin exige un código de un solo uso además de tu contraseña. Se configura una única vez.
        </div>

        {enrollError ? (
          <p className="feedback error" style={{ marginTop: 20 }}>
            {enrollError}
          </p>
        ) : (
          <>
            {params.error ? (
              <p className="feedback error" style={{ marginTop: 20 }}>
                {params.error}
              </p>
            ) : null}

            {qrCode && secret ? (
              <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 14 }}>
                <p style={{ fontSize: 13.5, color: "var(--ink-3)", margin: 0 }}>
                  1. Escanea este código con Google Authenticator, 1Password o cualquier app TOTP.
                </p>
                <div
                  style={{
                    background: "#fff",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    padding: 16,
                    display: "flex",
                    justifyContent: "center"
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- Supabase returns a one-time SVG data URI, not a static asset. */}
                  <img src={qrCode} alt="Código QR para activar el doble factor" width={180} height={180} />
                </div>
                <p style={{ fontSize: 12.5, color: "var(--ink-3)", margin: 0 }}>
                  ¿No puedes escanear? Introduce esta clave a mano:
                </p>
                <code
                  style={{
                    fontSize: 13,
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                    background: "var(--surface-2, #F4F6FA)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: "8px 10px",
                    wordBreak: "break-all",
                    userSelect: "all"
                  }}
                >
                  {secret}
                </code>
              </div>
            ) : (
              <p style={{ fontSize: 13.5, color: "var(--ink-3)", marginTop: 20 }}>
                Ya generaste un código para esta cuenta. Introduce el código de 6 dígitos de tu app para
                activarlo.
              </p>
            )}

            {factorId ? (
              <form action={verifyEnrollment} className="auth-form" style={{ marginTop: 18 }}>
                <input type="hidden" name="factorId" value={factorId} />
                <div>
                  <label className="field-label" htmlFor="code">
                    {qrCode ? "2. Código de 6 dígitos" : "Código de 6 dígitos"}
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
                  Verificar y activar
                </button>
              </form>
            ) : null}

            {!qrCode && factorId ? (
              <form action={regenerateEnrollment} style={{ marginTop: 12, textAlign: "center" }}>
                <input type="hidden" name="factorId" value={factorId} />
                <button type="submit" className="link-mini" style={{ background: "none", border: 0, cursor: "pointer" }}>
                  ¿Perdiste el código? Generar uno nuevo
                </button>
              </form>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
