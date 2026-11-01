import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { loginRedirectPath, REQUEST_PATH_HEADER } from "@/lib/login-redirect";
import { createClient } from "@/lib/supabase/server";

/**
 * `supabase.auth.getUser()` is a network round trip to the Supabase Auth
 * server, not a local JWT check. `React.cache()` memoizes this per request,
 * so the many call sites that each need the current user (layouts, pages,
 * `requireActiveProject`, `getPlanForUser`, ...) collapse to a single auth
 * round trip instead of one each (docs/architecture-audit-2026-07.md,
 * finding 1.2).
 */
export const requireUser = cache(async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    // LOGIN-NEXT-UTM-1: back to the same page after signing in, with the
    // link's UTM tags on the login itself (header set by middleware.ts).
    redirect(loginRedirectPath(await requestedPath()));
  }

  return { supabase, user };
});

async function requestedPath(): Promise<string | null> {
  try {
    return (await headers()).get(REQUEST_PATH_HEADER);
  } catch {
    return null;
  }
}

/**
 * Lo que `requireUser` devuelve: el cliente de Supabase ya autenticado y el
 * usuario. Es el argumento que atraviesa casi toda la capa de servidor.
 *
 * PRELAUNCH-HARDENING-1 Fase R6 (2/2): estaba definido en
 * `lib/scan/types.ts`, y de ahí lo importaban diecisiete módulos que no tienen
 * nada que ver con el escaneo — competidores, alias de marca, facturación,
 * auditoría web, recomendaciones. Era el grueso de la dependencia de medio
 * repositorio sobre `lib/scan/`, y ni siquiera es un tipo de escaneo: es el
 * tipo de retorno de la función de esta misma línea (log §82).
 */
export type AuthenticatedContext = Awaited<ReturnType<typeof requireUser>>;
