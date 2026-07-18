import Link from "next/link";

export default async function SignupConfirmPage({
  searchParams
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const params = await searchParams;
  const email = params.email;

  return (
    <main className="auth-bg">
      <div className="auth-card">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
          <div className="brand-mark">
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
            </svg>
          </div>
          <div className="brand-name">GenScore</div>
        </div>

        <h1 className="auth-title">Confirma tu email</h1>
        <p className="sub" style={{ marginTop: 4 }}>
          {email ? (
            <>
              Te hemos enviado un enlace de confirmación a <b>{email}</b>. Ábrelo para activar tu cuenta y
              empezar tu prueba de Pro.
            </>
          ) : (
            <>Te hemos enviado un enlace de confirmación por email. Ábrelo para activar tu cuenta.</>
          )}
        </p>

        <p style={{ marginTop: 16, fontSize: 13, color: "#6b7280" }}>
          ¿No te ha llegado? Revisa la carpeta de spam. Si el email es incorrecto,{" "}
          <Link className="underline" href="/signup">vuelve a registrarte</Link>.
        </p>

        <p style={{ marginTop: 16, textAlign: "center", fontSize: 13 }}>
          ¿Ya confirmaste? <Link className="underline" href="/login">Inicia sesión</Link>
        </p>
      </div>
    </main>
  );
}
