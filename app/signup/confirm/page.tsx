import Link from "next/link";
import "@/app/ins/tokens.css";
import "@/app/ins/components.css";
import "@/app/ins/auth.css";
import { AuthHead, AuthPage } from "@/components/ins/auth/page";
import type { Metadata } from "next";
import { ConversionOnMount } from "@/components/ads/conversion-on-mount";

/**
 * SEO-POS-1 (T10). Pantalla de acceso: contenido fino, sin valor de búsqueda y
 * duplicada en título con el resto del sitio. `robots.ts` solo excluía
 * /dashboard, /api y /auth, así que estas eran rastreables e indexables pese a
 * estar enlazadas desde todos los shells de marketing. `follow: true` porque
 * los enlaces de la página sí deben seguir repartiendo autoridad.
 */
export const metadata: Metadata = {
  title: "Confirma tu correo · GenScore",
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
    <AuthPage lit={1}>
      {/* PAID-ADS-1: the account exists from here on (unconfirmed); this is
          the sign-up conversion. No-op without ad tags and consent. */}
      <ConversionOnMount kind="sign_up" dedupeKey="sign_up" />
      <AuthHead title="Confirma tu email">
        {email ? (
          <>
            Te hemos enviado un enlace a <b>{email}</b>. Ábrelo para activar tu cuenta y empezar tu prueba de Pro.
          </>
        ) : (
          <>Te hemos enviado un enlace por email. Ábrelo para activar tu cuenta.</>
        )}
      </AuthHead>
      <Link className="au-btn au-p" href="/login">
        <span className="lbl">Ya lo he confirmado</span>
      </Link>
      <p className="au-alt">
        ¿No te ha llegado? Revisa el spam o <Link href="/signup">vuelve a registrarte</Link>.
      </p>
    </AuthPage>
  );
}
