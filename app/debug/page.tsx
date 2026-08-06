import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

/**
 * DOMAINS-REDESIGN-1 — atajo de operación a `/debug`.
 *
 * La pantalla interna vive en `/dashboard/projects/[projectId]/debug`, y por
 * diseño no está enlazada desde ningún sitio: el menú es superficie de cliente
 * y la pantalla muestra coste, cola de trabajos y errores del proveedor.
 *
 * El efecto secundario, que descubrió el fundador intentando abrirla el mismo
 * día (2026-08-05): la única forma de llegar era escribir a mano una URL con un
 * UUID dentro. Una pantalla de operación a la que el operador no puede llegar
 * no es discreta, es inservible.
 *
 * Esta ruta resuelve el proyecto por él —el más reciente, el mismo criterio de
 * reserva que usan la barra lateral y la portada de Dominios— y redirige. Sigue
 * sin aparecer en ningún menú: es una URL que se recuerda, no un enlace que se
 * ve. Si la cuenta no tiene proyectos, manda a Dominios, que es donde se crea
 * el primero.
 *
 * En la raíz (`/debug`) y no bajo `/dashboard`, por petición del fundador: es
 * la URL que tecleó de memoria cuando fue a buscarla, y el 404 que se llevó fue
 * precisamente por eso.
 *
 * `requireUser` la protege igual que a cualquier pantalla de la consola — sin
 * sesión redirige a /login —, así que estar fuera de `/dashboard` no la deja
 * abierta. Lo que NO hace es distinguir operador de cliente: eso sigue
 * pendiente para antes de publicar la web (ver histórico §32).
 */
export default async function DebugShortcutPage() {
  const { supabase } = await requireUser();

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("is_archived", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!project) redirect("/dashboard/domains");

  redirect(`/dashboard/projects/${project.id}/debug`);
}
