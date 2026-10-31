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
  searchParams: Promise<{ error?: string; deleted?: string; next?: string }>;
}) {
  const params = await searchParams;
  const next = safeNextPath(params.next);

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (user) redirect(next ?? "/dashboard");

  const inApp = await isInApp();

  return (
    <AuthPage splash={inApp}>
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
