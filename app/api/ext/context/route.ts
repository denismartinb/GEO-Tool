import { extJson, listExtProjects, readExtAccount } from "@/lib/ext/account";

export const dynamic = "force-dynamic";

/**
 * CHROME-EXT-1 paso 02 (log §361): who is signed in and which domains the
 * panel's selector lists. Only domains and plan; the project figures are
 * `/api/ext/project`. 401 when there is no session, so the panel shows
 * «Entrar».
 */
export async function GET() {
  const account = await readExtAccount();
  if (!account) return extJson({ error: "unauthenticated" }, 401);
  const projects = await listExtProjects(account);
  return extJson({
    email: account.user.email,
    plan: { id: account.planId, name: account.planName },
    trialEndsAt: account.trialEndsAt,
    domainCap: account.domainCap,
    domains: projects.map((p) => ({ domain: p.domain, brand: p.brand?.trim() || p.name }))
  });
}
