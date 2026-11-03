/**
 * AGENTIC-COMMERCE-1: did the site answer our bot with a block or a
 * challenge instead of the page? Pure.
 *
 * We ask as GenScore's own, identified bot (`AUDIT_USER_AGENT`), never
 * pretending to be ChatGPT or Claude. Anti-bot services verify the real
 * agents by IP range or signature, so a spoofed user-agent would not get
 * their answer anyway (`docs/adr/0043`). What this measures, and what the
 * product says, is narrower and true: «your site puts a challenge in front
 * of automated visits».
 */

export type ChallengeInput = {
  status: number;
  /** Lower-cased header names. */
  headers: Record<string, string | undefined>;
  body: string;
};

const CHALLENGE_BODY =
  /just a moment\.\.\.|cf-chl-|challenge-platform|cf_chl_opt|attention required! \| cloudflare|_incapsula_resource|incapsula incident|px-captcha|perimeterx|captcha-delivery\.com|datadome|access denied<\/title>|errors\.edgesuite\.net|verify you are human|verifica que eres (?:una persona|humano)|verificaci[oó]n de seguridad en curso|comprobando si la conexi[oó]n es segura|checking (?:if the site connection is secure|your browser)|performing security verification/i;

/**
 * AGENTS-TRUTH-1 (log §464): what a challenge says on screen, in Spanish and
 * English, read from the visible text of a page a browser rendered. The
 * rendered page keeps every script, so it can be larger than the 40 KB the
 * raw check allows; a short visible text with one of these lines is the
 * challenge, not the store (PcComponentes and Worten served «Verificación de
 * seguridad en curso» to the browser).
 */
export const CHALLENGE_TEXT =
  /verificaci[oó]n de seguridad en curso|comprobando si la conexi[oó]n es segura|un momento\s*(?:…|\.\.\.)|just a moment\s*(?:…|\.\.\.)|checking (?:if the site connection is secure|your browser)|performing security verification|verify you are human|verifica que eres (?:una persona|humano)|press (?:&|and) hold|mant[eé]n pulsado|access denied|acceso denegado|you have been blocked|has sido bloquead|request unsuccessful|pardon our interruption/i;

export function isRenderedChallenge(title: string, visibleText: string): boolean {
  if (CHALLENGE_TEXT.test(title)) return true;
  return visibleText.length < 1_500 && CHALLENGE_TEXT.test(visibleText);
}

/**
 * The browser opened an error page instead of the product: the render keeps
 * no HTTP status, so this reads the title and the main heading (Factorial's
 * 404 came out as a page without price or button).
 */
const ERROR_PAGE =
  /^\s*(?:error\s*)?404\b|\b404\b[^.]{0,40}(?:no encontrad|not found|no existe)|p[aá]gina no encontrada|page not found|no (?:hemos podido |podemos )?encontra(?:r|mos) (?:la|esta) p[aá]gina|esta p[aá]gina no existe|la p[aá]gina que buscas no|^\s*not found\s*$|^\s*(?:error\s*)?(?:500|502|503)\b|^\s*403\b|forbidden|too many requests|^\s*access denied\s*$/i;

export function isRenderedErrorPage(title: string, h1: string): "not_found" | "blocked" | "error" | null {
  for (const text of [title, h1]) {
    if (!ERROR_PAGE.test(text)) continue;
    if (/^\s*403\b|forbidden|too many requests|access denied/i.test(text)) return "blocked";
    return /404|no encontrad|not found|no existe|no (?:hemos podido |podemos )?encontra|que buscas/i.test(text) ? "not_found" : "error";
  }
  return null;
}

/**
 * An error page whose title is the site's usual one and has no h1: only its
 * short text says it is a 404 (log §464, factorial.es after the 33-page test).
 * Only on a short page, so a product that mentions «no encontramos» is safe.
 */
const NOT_FOUND_TEXT =
  /no (?:hemos podido |podemos )?encontra(?:r|mos) lo que (?:est[aá]s )?buscando|la p[aá]gina (?:que buscas )?(?:no existe|se ha movido)|p[aá]gina no encontrada|page not found|we can'?t find (?:that|the) page/i;
export const NOT_FOUND_MAX_CHARS = 1500;

export function isRenderedNotFoundText(text: string): boolean {
  return text.length <= NOT_FOUND_MAX_CHARS && NOT_FOUND_TEXT.test(text);
}

export function isChallengeResponse(input: ChallengeInput): boolean {
  const mitigated = (input.headers["cf-mitigated"] ?? "").toLowerCase();
  if (mitigated.includes("challenge")) return true;

  const blockedStatus = input.status === 401 || input.status === 403 || input.status === 429 || input.status === 503;
  if (blockedStatus) return true;

  // A 200 that is really an interstitial: small page, challenge markup.
  return input.status >= 200 && input.status < 300 && input.body.length < 40_000 && CHALLENGE_BODY.test(input.body);
}
