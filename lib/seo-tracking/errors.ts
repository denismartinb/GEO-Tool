/**
 * SEO-TRACK-1 (log §341): what a failed DataForSEO call is persisted as.
 * `category: message`, both written here, never the provider's own text
 * (`.claude/rules/scan.md`, «Persist categorized, self-authored error
 * messages»).
 *
 * `auth` and `balance` are the operator's to fix (credentials, top-up) and
 * are never retried. `timeout` and `provider` get one bounded retry.
 */
export type SeoErrorCategory = "auth" | "balance" | "timeout" | "provider";

export const SEO_ERROR_MESSAGES: Record<SeoErrorCategory, string> = {
  auth: "auth: DataForSEO rechazó las credenciales",
  balance: "balance: sin saldo en DataForSEO",
  timeout: "timeout: DataForSEO no respondió a tiempo",
  provider: "provider: DataForSEO devolvió un error"
};

/**
 * `code` is the envelope's `status_code` (401 for an HTTP 401) and `message`
 * the transport's own self-authored text from `callDataForSeo`.
 * DataForSEO uses 401xx for authentication and 402xx for payment/balance.
 */
export function categorizeDfsFailure(code: number | null, message: string): SeoErrorCategory {
  if (code === 401 || (code !== null && code >= 40100 && code < 40200)) return "auth";
  if (code !== null && code >= 40200 && code < 40300) return "balance";
  if (message === "Tiempo agotado") return "timeout";
  return "provider";
}

export function isRetryable(category: SeoErrorCategory): boolean {
  return category === "timeout" || category === "provider";
}

/** Categories the operator has to act on: they trigger the ops email. */
export function needsOperator(category: SeoErrorCategory): boolean {
  return category === "auth" || category === "balance";
}
