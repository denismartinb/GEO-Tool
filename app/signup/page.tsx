import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

async function signup(formData: FormData) {
  "use server";

  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    redirect(`/signup?error=${encodeURIComponent(error.message)}`);
  }

  // Profiles are created by the database trigger in 0003_v0_profile_trigger.sql.

  redirect("/dashboard");
}

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;

  return (
    <main className="auth-bg">
      <div className="auth-card">
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
          <div className="brand-mark">
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
            </svg>
          </div>
          <div className="brand-name">GEO Studio</div>
        </div>

        {/* Título */}
        <h1 className="auth-title">Crea tu cuenta</h1>
        <p className="sub" style={{ marginTop: 4, marginBottom: 20 }}>
          Empieza a mejorar tu visibilidad en IA.
        </p>

        {/* Form */}
        <form action={signup} className="space-y-3">
          <div>
            <Label htmlFor="email">Email de trabajo</Label>
            <Input id="email" name="email" type="email" required placeholder="nombre@empresa.com" />
          </div>
          <div>
            <Label htmlFor="password">Contraseña</Label>
            <Input id="password" name="password" type="password" required minLength={8} />
          </div>
          {params.error ? <p className="feedback error">{params.error}</p> : null}
          <Button type="submit" className="w-full">
            Crear cuenta gratis
          </Button>
        </form>

        {/* Divider */}
        <div className="auth-divider">o regístrate con</div>

        {/* SSO button */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button type="button" className="auth-sso-btn" disabled aria-disabled="true">
            <svg width={17} height={17} viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continuar con Google
          </button>
        </div>

        {/* Link login */}
        <p style={{ marginTop: 16, textAlign: "center", fontSize: 13 }}>
          ¿Ya tienes cuenta?{" "}
          <Link className="underline" href="/login">Inicia sesión</Link>
        </p>

        {/* Términos */}
        <p className="auth-terms">
          Al continuar, aceptas nuestros Términos y la Política de privacidad.
        </p>
      </div>
    </main>
  );
}
