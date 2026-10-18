import "server-only";

import { readEnvelope, type DfsEnvelope } from "@/lib/seo-data/dataforseo-parse";

/**
 * SEO-DIAG-0 (log §339): DataForSEO transport. Basic auth from
 * `DATAFORSEO_LOGIN` + `DATAFORSEO_PASSWORD` (the API password from the
 * dashboard, not the account password). Without them nothing is called.
 *
 * One call per request, live endpoints only, one timeout and no retry: this
 * is the operator diagnosis, and a failed step is shown as failed with what
 * it cost. The credentials never leave this module and are never logged.
 */

const API = "https://api.dataforseo.com/v3";
export const DATAFORSEO_TIMEOUT_MS = 40_000;
/** Spain, Spanish: GenScore's market. */
export const SPAIN = { location_code: 2724, language_code: "es" } as const;

function authHeader(): string | null {
  const login = process.env.DATAFORSEO_LOGIN?.trim();
  const password = process.env.DATAFORSEO_PASSWORD?.trim();
  if (!login || !password) return null;
  return `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`;
}

export function dataForSeoConfigured(): boolean {
  return authHeader() !== null;
}

export async function callDataForSeo(path: string, task: Record<string, unknown> | null, timeoutMs = DATAFORSEO_TIMEOUT_MS): Promise<DfsEnvelope> {
  const auth = authHeader();
  if (!auth) return { ok: false, cost: 0, code: null, message: "Faltan DATAFORSEO_LOGIN y DATAFORSEO_PASSWORD" };
  try {
    const response = await fetch(`${API}/${path}`, {
      method: task ? "POST" : "GET",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: task ? JSON.stringify([task]) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store"
    });
    if (response.status === 401) return { ok: false, cost: 0, code: 401, message: "Credenciales rechazadas" };
    return readEnvelope(await response.json());
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return { ok: false, cost: 0, code: null, message: timedOut ? "Tiempo agotado" : "No se pudo conectar" };
  }
}

/** Account balance in USD, from appendix/user_data. */
export async function readBalance(): Promise<number | null> {
  const reply = await callDataForSeo("appendix/user_data", null, 15_000);
  if (!reply.ok) return null;
  const money = reply.result?.money as Record<string, unknown> | undefined;
  return typeof money?.balance === "number" ? money.balance : null;
}
