import { cookies } from "next/headers";
import { ACTIVE_PROJECT_COOKIE, resolveSelectedProject } from "@/lib/active-project-cookie";
import { extJson, listExtProjects, readExtAccount } from "@/lib/ext/account";

export const dynamic = "force-dynamic";

/**
 * CHROME-EXT-1 paso 02 (log §361): who is signed in and which domains the
 * panel's selector lists. Only domains and plan; the project figures are
 * `/api/ext/project`. 401 when there is no session, so the panel shows
 * «Entrar».
 *
 * `activeDomain` is the domain the console is pointed at (the
 * `geo_active_project` cookie, resolved like `/dashboard/domains` does), so
 * the panel opens on the same project (Denis, 2026-10-30). A stale or foreign
 * id falls through to the newest project, never to another account's.
 */
export async function GET() {
  const account = await readExtAccount();
  if (!account) return extJson({ error: "unauthenticated" }, 401);
  const projects = await listExtProjects(account);
  const remembered = (await cookies()).get(ACTIVE_PROJECT_COOKIE)?.value ?? null;
  return extJson({
    email: account.user.email,
    plan: { id: account.planId, name: account.planName },
    trialEndsAt: account.trialEndsAt,
    domainCap: account.domainCap,
    activeDomain: resolveSelectedProject(projects, null, remembered)?.domain ?? null,
    domains: projects.map((p) => ({ domain: p.domain, brand: p.brand?.trim() || p.name }))
  });
}
