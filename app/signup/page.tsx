import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

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
      <Card className="auth-card">
        <CardHeader className="card-head border-b-0 !px-0 !pt-0">
          <div className="brand-name">GEO Studio</div>
          <h1 className="auth-title mt-3">Crea tu cuenta</h1>
          <p className="sub mt-1">Empieza a monitorizar visibilidad en IA.</p>
        </CardHeader>
        <CardContent className="!px-0 !pt-2">
          <form action={signup} className="space-y-3">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required />
            </div>
            <div>
              <Label htmlFor="password">Contraseña</Label>
              <Input id="password" name="password" type="password" required minLength={8} />
            </div>
            {params.error ? <p className="feedback error">{params.error}</p> : null}
            <Button type="submit" className="w-full">
              <Icon name="play" size={14} />
              Crear cuenta
            </Button>
          </form>
          <p className="mt-4 text-sm text-[var(--ink-3)]">
            ¿Ya tienes cuenta? <Link className="underline" href="/login">Iniciar sesión</Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
