import { createClient } from "@/lib/supabase/server";
import { ConnectedAppRow } from "./connected-app-row";

/**
 * MCP-SERVER-1 (log §418): the apps (Claude, ChatGPT…) this account let read
 * GenScore through the MCP server, with «Desconectar». Read from Supabase
 * Auth's OAuth server with the user's own session. Nothing connected, or the
 * OAuth server off: nothing is painted.
 */
export async function ConnectedApps() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.oauth.listGrants().catch(() => ({ data: null, error: true }));
  if (error || !Array.isArray(data) || !data.length) return null;
  return (
    <div className="set-end">
      <div className="set-row-txt" style={{ flexBasis: "100%" }}>
        <div className="set-end-t">Apps conectadas</div>
        <div className="set-end-d">Pueden leer tus datos de GenScore desde el chat, sin cambiar nada. Desconéctalas cuando quieras.</div>
      </div>
      {data.map((g) => (
        <ConnectedAppRow
          key={g.client.id}
          clientId={g.client.id}
          name={g.client.name || "App sin nombre"}
          grantedAt={g.granted_at ? new Date(g.granted_at).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" }) : null}
        />
      ))}
    </div>
  );
}
