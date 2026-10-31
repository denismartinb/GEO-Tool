import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AuthHead, AuthPage } from "@/components/ins/auth/page";
import { EntryForm } from "@/components/ins/auth/entry-form";
import { Ic } from "@/components/ins/ic";
import "@/app/ins/tokens.css";
import "@/app/ins/components.css";
import "@/app/ins/auth.css";
import { isInApp } from "@/lib/app-mode-server";
import { APP_MODE_ENTER, APP_MODE_HOME } from "@/lib/app-mode";
import { safeNextPath } from "@/lib/safe-next-path";
import { login, signInWithGoogle } from "./actions";
import type { Metadata } from "next";

/**
 * SEO-POS-1 (T10). Pantalla de acceso: contenido fino, sin valor de búsqueda y
 * duplicada en título con el resto del sitio. `robots.ts` solo excluía
 * /dashboard, /api y /auth, así que estas eran rastreables e indexables pese a
 * estar enlazadas desde todos los shells de marketing. `follow: true` porque
 * los enlaces de la página sí deben seguir repartiendo autoridad.
 */
export const metadata: Metadata = {
  title: "Iniciar sesión · GenScore",
  robots: { index: false, follow: true }
};


export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; deleted?: string; next?: string; source?: string }>;
}) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  // APP-LAUNCH-1 (log §389): `?source=twa` is an opening of the Android app
  // (its start_url, or a console link the middleware sent here). It counts as
  // in-app even on the very first launch, when the `gs_app` cookie is only
  // being set on this same response and the request does not carry it yet.
  const launch = params.source === APP_MODE_ENTER;
  const inApp = launch || (await isInApp());

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (user) {
    const to = next ?? APP_MODE_HOME;
    // With the session already open, an app opening still gets its splash,
    // landing on this lockup, and then goes straight to the console.
    if (!launch) redirect(to);
    return (
      <AuthPage splash launch continueTo={to}>
        <AuthHead title="Hola de nuevo.">Abriendo tu consola…</AuthHead>
        <p className="au-alt">
          <Link href={to}>Ir a la consola</Link>
        </p>
      </AuthPage>
    );
  }

  return (
    <AuthPage splash={inApp} launch={launch}>
      <AuthHead title="Hola de nuevo.">Tu visibilidad en la IA, donde la dejaste.</AuthHead>
      {params.deleted === "1" ? (
        <div className="au-note">
          <Ic n="checkc" sm />
          Tu cuenta se ha eliminado correctamente.
        </div>
      ) : null}
      <EntryForm mode="login" action={login} googleAction={signInWithGoogle} next={next} error={params.error} />
      <p className="au-alt">
        ¿No tienes cuenta? <Link href="/signup">Regístrate</Link>
      </p>
      <p className="au-legal">
        Al continuar, aceptas los <Link href="/terminos">Términos</Link> y la{" "}
        <Link href="/privacidad">Política de privacidad</Link>.
      </p>
    </AuthPage>
  );
}
