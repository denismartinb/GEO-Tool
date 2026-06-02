import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Icon } from "@/components/ui/icon";
import { createProject } from "../actions";

export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const errorMessages: Record<string, string> = {
    invalid_project_data: "Revisa los datos del proyecto e inténtalo de nuevo.",
    project_creation_failed: "No se pudo crear el proyecto. Inténtalo de nuevo."
  };
  const errorMessage = params.error ? errorMessages[params.error] : null;

  return (
    <div className="page mx-auto max-w-2xl space-y-4">
      <p className="kicker">Proyectos</p>
      <div className="flex items-center justify-between">
        <h1 className="title-lg">Nuevo proyecto</h1>
        <Link href="/dashboard/projects" className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--ink-2)]">
          <Icon name="chevronLeft" size={14} />
          Volver
        </Link>
      </div>

      <Card>
        <CardHeader>
          <h2 className="font-medium">Datos del proyecto</h2>
        </CardHeader>
        <CardContent>
          <form action={createProject} className="space-y-3">
            <div>
              <Label htmlFor="name">Nombre</Label>
              <Input id="name" name="name" required />
            </div>
            <div>
              <Label htmlFor="domain">Dominio</Label>
              <Input id="domain" name="domain" placeholder="example.com" required />
            </div>
            <div>
              <Label htmlFor="brand">Marca</Label>
              <Input id="brand" name="brand" required />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="country">País</Label>
                <Input id="country" name="country" placeholder="ES" required />
              </div>
              <div>
                <Label htmlFor="language">Idioma</Label>
                <Input id="language" name="language" placeholder="es" required />
              </div>
            </div>
            {errorMessage ? <p className="feedback error">{errorMessage}</p> : null}
            <Button type="submit">Crear proyecto</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
