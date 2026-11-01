"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { decideConsent } from "@/lib/mcp/consent";

const Schema = z.object({
  authorization_id: z.string().min(8).max(128),
  decision: z.enum(["approve", "deny"])
});

/**
 * MCP-SERVER-1 (log §418): «Permitir» or «Cancelar» on `/oauth/consentir`.
 * Supabase binds the request to the signed-in user, so this needs no write of
 * ours; it translates `decideConsent` into a redirect back to the client.
 */
export async function decideOAuthConsent(formData: FormData) {
  const parsed = Schema.safeParse({
    authorization_id: formData.get("authorization_id"),
    decision: formData.get("decision")
  });
  if (!parsed.success) redirect("/oauth/consentir?error=invalid");
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/oauth/consentir?authorization_id=${parsed.data.authorization_id}`)}`);
  const outcome = await decideConsent(supabase.auth.oauth, parsed.data.authorization_id, parsed.data.decision === "approve");
  if (outcome.kind === "error") redirect("/oauth/consentir?error=expired");
  redirect(outcome.url);
}
