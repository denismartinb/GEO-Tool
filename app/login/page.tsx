import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

async function login(formData: FormData) {
  "use server";

  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/dashboard");
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;

  return (
    <main className="auth-bg">
      <Card className="auth-card">
        <CardHeader className="card-head border-b-0 !px-0 !pt-0">
          <div className="brand-name">Lumira</div>
          <h1 className="auth-title mt-3">Bienvenido de nuevo</h1>
          <p className="sub mt-1">Accede a tu panel GEO.</p>
        </CardHeader>
        <CardContent className="!px-0 !pt-2">
          <form action={login} className="space-y-3">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required />
            </div>
            <div>
              <Label htmlFor="password">Contraseña</Label>
              <Input id="password" name="password" type="password" required />
            </div>
            {params.error ? <p className="feedback error">{params.error}</p> : null}
            <Button type="submit" className="w-full">
              <Icon name="play" size={14} />
              Iniciar sesión
            </Button>
          </form>
          <p className="mt-4 text-sm text-[var(--ink-3)]">
            ¿No tienes cuenta? <Link className="underline" href="/signup">Crear cuenta</Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
