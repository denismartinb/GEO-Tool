import Link from "next/link";
import { redirect } from "next/navigation";
import "@/app/ins/tokens.css";
import "@/app/ins/components.css";
import "@/app/ins/auth.css";
import { AuthHead, AuthPage } from "@/components/ins/auth/page";
import { EntryForm } from "@/components/ins/auth/entry-form";
import { createClient } from "@/lib/supabase/server";
import { signInWithGoogle } from "@/app/login/actions";
import { signup } from "./actions";
import type { Metadata } from "next";

/**
 * SEO-POS-1 (T10). Pantalla de acceso: contenido fino, sin valor de búsqueda y
 * duplicada en título con el resto del sitio. `robots.ts` solo excluía
 * /dashboard, /api y /auth, así que estas eran rastreables e indexables pese a
 * estar enlazadas desde todos los shells de marketing. `follow: true` porque
 * los enlaces de la página sí deben seguir repartiendo autoridad.
 */
export const metadata: Metadata = {
  title: "Crear cuenta · GenScore",
  robots: { index: false, follow: true }
};


export default async function SignupPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <AuthPage>
      <AuthHead title="Crea tu cuenta">7 días de Pro gratis, sin tarjeta.</AuthHead>
      <EntryForm mode="signup" action={signup} googleAction={signInWithGoogle} error={params.error} />
      <p className="au-alt">
        ¿Ya tienes cuenta? <Link href="/login">Inicia sesión</Link>
      </p>
      {/* EMAIL-UNSUB-1 (log §232): no checkbox, by founder decision
          (2026-09-28). This line INFORMS and says where the way out is. It
          covers both sign-up paths (email and Google) because it sits below
          both. Prototype wording (log §351). */}
      <p className="au-legal">
        Al continuar, aceptas los <Link href="/terminos">Términos</Link> y la{" "}
        <Link href="/privacidad">Política de privacidad</Link>. Te escribiremos sobre tu cuenta y con consejos;
        puedes darte de baja cuando quieras.
      </p>
    </AuthPage>
  );
}
