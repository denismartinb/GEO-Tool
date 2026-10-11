import "server-only";

import {
  deleteConnection,
  readConnection,
  readTokenCiphertext,
  saveProperty,
  type VerifiedIds
} from "@/lib/search-console/connection";
import { decryptRefreshToken } from "@/lib/search-console/crypto";
import { GscError, listSites, refreshAccessToken, revokeToken } from "@/lib/search-console/google";
import { PROPERTY_MAX_LENGTH, propertyMatchesDomain } from "@/lib/search-console/property";

/**
 * SEARCH-SEO-1 Fase 3 (log §283). The two writes a customer makes from
 * «Posición en Google»: choosing which property feeds the screen, and
 * disconnecting. Cores return a discriminated result; the actions translate
 * it (`.claude/rules/server-actions.md`). `ids` are already verified by the
 * caller (`requireActiveProject` + `requireUser().user.id`).
 */

export type SelectPropertyResult =
  | { ok: true }
  | { ok: false; error: "invalid" | "not_connected" | "not_listed" | "domain_mismatch" | "google" | "save_failed" };

export async function selectPropertyCore(
  ids: VerifiedIds,
  projectDomain: string,
  property: string
): Promise<SelectPropertyResult> {
  if (!property || property.length > PROPERTY_MAX_LENGTH) return { ok: false, error: "invalid" };
  if (!propertyMatchesDomain(property, projectDomain)) return { ok: false, error: "domain_mismatch" };

  const read = await readConnection(ids);
  if (read.kind !== "connected" || read.connection.status !== "active") return { ok: false, error: "not_connected" };
  const ciphertext = await readTokenCiphertext(ids);
  const decrypted = ciphertext ? decryptRefreshToken(ciphertext, ids.projectId, ids.ownerUserId) : null;
  if (!decrypted) return { ok: false, error: "not_connected" };

  try {
    const { accessToken } = await refreshAccessToken(decrypted.token);
    const sites = await listSites(accessToken);
    if (!sites.some((s) => s.siteUrl === property)) return { ok: false, error: "not_listed" };
  } catch (error) {
    return { ok: false, error: error instanceof GscError && error.category === "revoked" ? "not_connected" : "google" };
  }

  return (await saveProperty(ids, property)) ? { ok: true } : { ok: false, error: "save_failed" };
}

export type DisconnectResult = { ok: true } | { ok: false; error: "delete_failed" };

/** Revokes at Google best-effort, then deletes the row whatever Google said. */
export async function disconnectCore(ids: VerifiedIds): Promise<DisconnectResult> {
  const ciphertext = await readTokenCiphertext(ids);
  const decrypted = ciphertext ? decryptRefreshToken(ciphertext, ids.projectId, ids.ownerUserId) : null;
  if (decrypted) await revokeToken(decrypted.token);
  return (await deleteConnection(ids)) ? { ok: true } : { ok: false, error: "delete_failed" };
}
