import { redirect } from "next/navigation";
import type { Metadata } from "next";
import "@/app/ins/tokens.css";
import "@/app/ins/components.css";
import "@/app/ins/auth.css";
import { AuthHead, AuthPage } from "@/components/ins/auth/page";
import { OtpInput, SubmitButton } from "@/components/ins/auth/parts";
import { Ic } from "@/components/ins/ic";
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
    <AuthPage lit={1}>
      <AuthHead title="Activa el doble factor">
        /admin exige un código de un solo uso además de tu contraseña. Se configura una única vez.
      </AuthHead>

      {enrollError ? (
        <div className="au-fail" role="alert">
          <Ic n="warn" sm />
          {enrollError}
        </div>
      ) : (
        <>
          {params.error ? (
            <div className="au-fail" role="alert">
              <Ic n="warn" sm />
              {params.error}
            </div>
          ) : null}

          {qrCode && secret ? (
            <>
              <p className="au-hint">1. Escanea este código con Google Authenticator, 1Password o cualquier app TOTP.</p>
              <div className="au-qr">
                {/* eslint-disable-next-line @next/next/no-img-element -- Supabase returns a one-time SVG data URI, not a static asset. */}
                <img src={qrCode} alt="Código QR para activar el doble factor" width={180} height={180} />
              </div>
              <p className="au-hint">¿No puedes escanear? Introduce esta clave a mano:</p>
              <code className="au-key">{secret}</code>
            </>
          ) : (
            <p className="au-hint">
              Ya generaste un código para esta cuenta. Introduce el código de 6 dígitos de tu app para activarlo.
            </p>
          )}

          {factorId ? (
            <form action={verifyEnrollment} className="au-step-form">
              <input type="hidden" name="factorId" value={factorId} />
              {qrCode ? <p className="au-hint">2. Código de 6 dígitos</p> : null}
              <OtpInput name="code" label="Código de 6 dígitos" />
              <SubmitButton pendingLabel="Verificando…">Verificar y activar</SubmitButton>
            </form>
          ) : null}

          {!qrCode && factorId ? (
            <form action={regenerateEnrollment} className="au-back">
              <input type="hidden" name="factorId" value={factorId} />
              <button type="submit">¿Perdiste el código? Generar uno nuevo</button>
            </form>
          ) : null}
        </>
      )}
    </AuthPage>
  );
}
