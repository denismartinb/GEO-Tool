import { redirect } from "next/navigation";
import type { Metadata } from "next";
import "@/app/ins/tokens.css";
import "@/app/ins/components.css";
import "@/app/ins/auth.css";
import { AuthHead, AuthPage } from "@/components/ins/auth/page";
import { createClient } from "@/lib/supabase/server";
import { AUTHORIZATION_ID, readConsent } from "@/lib/mcp/consent";
import { decideOAuthConsent } from "./actions";

export const metadata: Metadata = {
  title: "Conectar con GenScore · GenScore",
  robots: { index: false, follow: false }
};

export const dynamic = "force-dynamic";

/**
 * MCP-SERVER-1 (log §418): the consent screen of GenScore's MCP server.
 * Supabase Auth's OAuth 2.1 server sends Claude's or ChatGPT's sign-in here
 * with `authorization_id` (Authorization Path in the Supabase dashboard).
 * Same «Bruma» frame as the rest of the sign-in screens.
 */
export default async function OAuthConsentPage({
  searchParams
}: {
  searchParams: Promise<{ authorization_id?: string; error?: string }>;
}) {
  const params = await searchParams;
  const id = params.authorization_id;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user && id && AUTHORIZATION_ID.test(id)) {
    redirect(`/login?next=${encodeURIComponent(`/oauth/consentir?authorization_id=${id}`)}`);
  }

  const view = user && !params.error ? await readConsent(supabase.auth.oauth, id) : ({ kind: "invalid" } as const);
  if (view.kind === "redirect") redirect(view.url);

  if (view.kind === "invalid") {
    return (
      <AuthPage lit={1}>
        <AuthHead title="Esta conexión ha caducado">
          Vuelve a conectar GenScore desde Claude o ChatGPT. La solicitud solo vale unos minutos.
        </AuthHead>
      </AuthPage>
    );
  }

  const r = view.request;
  return (
    <AuthPage lit={2}>
      <AuthHead title={`Conectar ${r.clientName} con GenScore`}>
        <b>{r.clientName}</b> podrá leer los datos de la cuenta <b>{r.email}</b>: tus dominios, tu Puntuación GEO,
        recomendaciones, competidores, auditorías y datos de Search Console.
      </AuthHead>
      <p className="au-s">
        Solo lectura: no puede cambiar nada, lanzar escaneos ni ver tu facturación. Puedes desconectarlo cuando quieras
        en Ajustes, en la pestaña Cuenta.
      </p>
      {r.redirectHost ? <p className="au-alt">Al terminar volverás a {r.redirectHost}.</p> : null}
      <form action={decideOAuthConsent} style={{ width: "100%", marginTop: 22, display: "grid", gap: 10 }}>
        <input type="hidden" name="authorization_id" value={r.authorizationId} />
        <button className="au-btn au-p" type="submit" name="decision" value="approve">
          <span className="lbl">Permitir</span>
        </button>
        <button className="au-btn au-g" type="submit" name="decision" value="deny">
          <span className="lbl">Cancelar</span>
        </button>
      </form>
    </AuthPage>
  );
}
