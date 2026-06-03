import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Icon } from "@/components/ui/icon";
import { createProject } from "../actions";

export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const errorMessages: Record<string, string> = {
    invalid_project_data: "Revisa los datos del proyecto e inténtalo de nuevo.",
    project_creation_failed: "No se pudo crear el proyecto. Inténtalo de nuevo.",
    project_already_archived: "Ya existe un proyecto archivado para ese dominio, país e idioma. Restáuralo para continuar.",
    project_already_active: "Ya existe un proyecto activo para ese dominio, país e idioma."
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
          <p className="sub mt-1">
            Define la base del proyecto antes del primer escaneo. No se lanzará ningún análisis hasta que lo hagas manualmente.
          </p>
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
            <div>
              <Label htmlFor="business_description">Describe brevemente tu negocio o categoría</Label>
              <Textarea
                id="business_description"
                name="business_description"
                placeholder="Ej. Operador de fibra y móvil en España"
                rows={3}
              />
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
            <div className="space-y-2">
              <div>
                <Label htmlFor="initial_prompts">Prompts iniciales</Label>
                <p className="sub mt-1">
                  Añade hasta 10 prompts iniciales. Podrás editarlos después antes de lanzar el primer escaneo.
                </p>
              </div>
              <Textarea
                id="initial_prompts"
                name="initial_prompts"
                placeholder={`¿Cuáles son las mejores opciones de fibra y móvil en España?
¿Qué alternativas a Movistar recomiendas?
¿Qué operador ofrece mejor relación calidad-precio?
¿Cuál es la opción más barata para contratar fibra?
¿Qué proveedor tiene mejores opiniones de clientes?`}
                rows={6}
              />
            </div>
            <div className="space-y-2">
              <div>
                <Label htmlFor="initial_competitors">Competidores iniciales</Label>
                <p className="sub mt-1">
                  Añade hasta 5 competidores. Formato recomendado: Nombre | dominio.com
                </p>
              </div>
              <Textarea
                id="initial_competitors"
                name="initial_competitors"
                placeholder={`Digi | digi.es
O2 | o2online.es
Lowi | lowi.es
MásMóvil | masmovil.es
Orange | orange.es`}
                rows={5}
              />
            </div>
            <p className="sub">
              Puedes editar estos datos antes de crear el proyecto. No se lanzará ningún escaneo hasta que lo hagas manualmente.
            </p>
            {errorMessage ? <p className="feedback error">{errorMessage}</p> : null}
            <Button type="submit">Crear proyecto</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
