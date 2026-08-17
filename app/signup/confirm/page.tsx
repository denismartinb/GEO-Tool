import Link from "next/link";
import { BrandLogo } from "@/components/ui/brand-logo";
import type { Metadata } from "next";

/**
 * SEO-POS-1 (T10). Pantalla de acceso: contenido fino, sin valor de búsqueda y
 * duplicada en título con el resto del sitio. `robots.ts` solo excluía
 * /dashboard, /api y /auth, así que estas eran rastreables e indexables pese a
 * estar enlazadas desde todos los shells de marketing. `follow: true` porque
 * los enlaces de la página sí deben seguir repartiendo autoridad.
 */
export const metadata: Metadata = {
  title: "Confirma tu correo — GenScore",
  robots: { index: false, follow: true }
};


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
        <div className="auth-logo">
          <BrandLogo size={24} />
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
