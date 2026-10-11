import "server-only";

import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * SEARCH-SEO-1 Fase 3 (log §284). Secrets of the Search Console connection.
 *
 * One master key, `GSC_TOKEN_ENCRYPTION_KEY` (32 bytes, base64), from which two
 * independent subkeys are derived with HKDF-SHA256 — one encrypts refresh
 * tokens, the other signs the OAuth `state`. The raw key is never used
 * directly for either (data-guardian review).
 *
 * Ciphertext format: `v1:<keyId>:<base64url(iv | tag | ct)>`. `keyId` is the
 * first 8 hex chars of SHA-256 of the master key, so a rotation
 * (`GSC_TOKEN_ENCRYPTION_KEY_PREVIOUS`) can still decrypt old rows and the
 * loader re-encrypts them under the current key. The AAD binds a ciphertext to
 * its project and owner, so a row's token cannot be moved to another row.
 *
 * Fails closed: without a valid key `isSearchConsoleCryptoConfigured()` is
 * false and the feature is not offered.
 */

const FORMAT = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type DerivedKey = { id: string; enc: Buffer; state: Buffer };

function decodeMasterKey(raw: string | undefined): Buffer | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  try {
    const key = Buffer.from(trimmed, "base64");
    return key.length === 32 ? key : null;
  } catch {
    return null;
  }
}

function derive(master: Buffer): DerivedKey {
  const sub = (info: string) => Buffer.from(hkdfSync("sha256", master, Buffer.alloc(0), info, 32));
  return {
    id: createHash("sha256").update(master).digest("hex").slice(0, 8),
    enc: sub("genscore:gsc:token-enc:v1"),
    state: sub("genscore:gsc:oauth-state:v1")
  };
}

function keyring(): { current: DerivedKey | null; all: DerivedKey[] } {
  const current = decodeMasterKey(process.env.GSC_TOKEN_ENCRYPTION_KEY);
  const previous = decodeMasterKey(process.env.GSC_TOKEN_ENCRYPTION_KEY_PREVIOUS);
  const all: DerivedKey[] = [];
  const cur = current ? derive(current) : null;
  if (cur) all.push(cur);
  if (previous) all.push(derive(previous));
  return { current: cur, all };
}

export function isSearchConsoleCryptoConfigured(): boolean {
  return keyring().current !== null;
}

function aad(projectId: string, ownerUserId: string): Buffer {
  return Buffer.from(`genscore:gsc:v1:${projectId.toLowerCase()}:${ownerUserId.toLowerCase()}`, "utf8");
}

export function encryptRefreshToken(token: string, projectId: string, ownerUserId: string): string {
  const { current } = keyring();
  if (!current) throw new Error("config: search console key missing");
  if (!UUID_PATTERN.test(projectId) || !UUID_PATTERN.test(ownerUserId)) throw new Error("config: invalid ids");
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", current.enc, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(aad(projectId, ownerUserId));
  const ct = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${FORMAT}:${current.id}:${Buffer.concat([iv, tag, ct]).toString("base64url")}`;
}

export type DecryptResult = { token: string; needsReencrypt: boolean } | null;

/** `null` for anything that does not decrypt — never an exception. */
export function decryptRefreshToken(payload: string, projectId: string, ownerUserId: string): DecryptResult {
  const parts = payload.split(":");
  if (parts.length !== 3 || parts[0] !== FORMAT) return null;
  const [, keyId, body] = parts;
  const { current, all } = keyring();
  const key = all.find((k) => k.id === keyId);
  if (!key) return null;
  const raw = Buffer.from(body, "base64url");
  if (raw.length <= IV_BYTES + TAG_BYTES) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key.enc, raw.subarray(0, IV_BYTES), { authTagLength: TAG_BYTES });
    decipher.setAAD(aad(projectId, ownerUserId));
    decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
    const token = Buffer.concat([decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString("utf8");
    return { token, needsReencrypt: current?.id !== key.id };
  } catch {
    return null;
  }
}

// ── OAuth state ───────────────────────────────────────────────────────────

export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export type OAuthState = { p: string; u: string; n: string; exp: number };

function secureEquals(a: string, b: string): boolean {
  return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
}

function signPayload(key: Buffer, payload: string): string {
  return createHmac("sha256", key).update(payload, "utf8").digest("base64url");
}

/** `<base64url(json)>.<hmac>`, always signed with the current key. */
export function signOAuthState(state: OAuthState): string | null {
  const { current } = keyring();
  if (!current) return null;
  const payload = Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
  return `${payload}.${signPayload(current.state, payload)}`;
}

/** Signature and expiry only; the caller checks nonce, user and project. */
export function verifyOAuthState(raw: unknown, now: number): OAuthState | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 1024) return null;
  const [payload, sig, extra] = raw.split(".");
  if (!payload || !sig || extra !== undefined) return null;
  const { current } = keyring();
  if (!current || !secureEquals(signPayload(current.state, payload), sig)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<OAuthState>;
    if (
      typeof parsed.p !== "string" ||
      !UUID_PATTERN.test(parsed.p) ||
      typeof parsed.u !== "string" ||
      !UUID_PATTERN.test(parsed.u) ||
      typeof parsed.n !== "string" ||
      parsed.n.length < 16 ||
      typeof parsed.exp !== "number" ||
      parsed.exp < now
    ) {
      return null;
    }
    return { p: parsed.p, u: parsed.u, n: parsed.n, exp: parsed.exp };
  } catch {
    return null;
  }
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** PKCE S256 challenge for a verifier. */
export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier, "ascii").digest("base64url");
}

export function nonceMatches(a: string, b: string): boolean {
  return secureEquals(a, b);
}
