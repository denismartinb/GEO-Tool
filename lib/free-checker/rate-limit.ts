import { createHash } from "node:crypto";
import type { createServiceClient } from "@/lib/supabase/service";

/**
 * FREE-CHECKER-1 Fase B — los tres límites del comprobador anónimo.
 *
 * Hermano de `lib/web-audit/snapshot-rate-limit.ts` en forma (contar filas
 * recientes sobre una columna indexada) y distinto en lo que importa: allí se
 * cuenta por `project_id`, o sea por alguien con cuenta y con plan. Aquí no
 * hay cuenta, así que **no existe una sola clave por la que contar** y hacen
 * falta tres:
 *
 * - **Por IP.** Corta el abuso casual. No corta a nadie con un proxy: una IP
 *   se rota en dos minutos, así que este límite es comodidad, no protección.
 * - **Por dominio.** Impide que recomprobar el mismo sitio en bucle queme el
 *   techo del día para todos los demás.
 * - **Techo global diario.** El único que acota el gasto de verdad. Convierte
 *   un riesgo abierto en una factura conocida: a **~0,016 $ por comprobación**
 *   —generación en ChatGPT ($0,0117, con la tarifa de `web_search` dentro),
 *   extracción ($0,0004) y el perfil más la pregunta en Gemini ($0,004)— 300
 *   al día son **~4,80 $/día, ~145 $/mes en el peor caso absoluto**. Sin él,
 *   los otros dos son teatro.
 *
 *   Ese peor caso sólo ocurre si el techo se agota TODOS los días. Bajarlo es
 *   cambiar una constante, y por eso el número vive aquí y con su aritmética
 *   escrita: para que quien lo suba vea lo que está firmando.
 *
 * **Los tres fallan CERRADO.** Si la consulta de conteo falla, no se comprueba.
 * Es la dirección contraria a `sampling_enabled` (migración 0032, que falla
 * abierto porque está en la ruta crítica de todo escaneo) y por el mismo
 * razonamiento aplicado a un caso distinto: fallar abierto aquí significa
 * gastar dinero sin poder contarlo, en una ruta que cualquiera en internet
 * puede invocar. Lo peor que hace fallar cerrado es que un visitante vea el
 * modo degradado — que es una página que ya existe y funciona.
 *
 * Deliberadamente SIN `import "server-only"`: lógica pura sobre un cliente
 * inyectado, importable desde Vitest (mismo criterio que el módulo hermano).
 * La frontera de servidor está una capa más abajo, en `createServiceClient`.
 */

export type PublicCheckLimits = {
  /** Techo global de comprobaciones anónimas al día. El que acota el gasto. */
  globalPerDay: number;
  /** Comprobaciones por IP y día. */
  perIpPerDay: number;
  /** Comprobaciones del mismo dominio al día. */
  perDomainPerDay: number;
};

export const DEFAULT_PUBLIC_CHECK_LIMITS: PublicCheckLimits = {
  globalPerDay: 300,
  perIpPerDay: 3,
  perDomainPerDay: 3
};

const DAY_MS = 24 * 60 * 60 * 1000;
const LOG_PREFIX = "[geo:free-checker-rate-limit]";

/** Por qué se ha denegado. La página enseña un mensaje distinto en cada caso. */
export type PublicCheckDenial =
  /** El producto ha llegado a su techo del día. No es culpa del visitante. */
  | "global_ceiling_reached"
  /** Esta IP ya ha gastado sus comprobaciones de hoy. */
  | "ip_limit_reached"
  /** Este dominio ya se ha comprobado hoy las veces permitidas. */
  | "domain_limit_reached"
  /** No se ha podido contar. Se deniega por seguridad, no por política. */
  | "limit_check_failed";

export type PublicCheckLimitResult =
  | { allowed: true; usedToday: number; globalLimit: number }
  | { allowed: false; reason: PublicCheckDenial };

export type PublicCheckLimitDeps = {
  now?: () => number;
  limits?: PublicCheckLimits;
};

/**
 * sha256(ip + salt). **Nunca se guarda la IP.**
 *
 * Una IP es dato personal y no nos hace falta: nos hace falta contar. Con el
 * salt fuera de la base de datos, quien lea la tabla no puede volver a la IP,
 * y rotar el salt retira todos los hashes viejos de golpe.
 *
 * Si no hay salt configurado, **lanza**: un hash sin salt es un diccionario
 * de 4.000 millones de entradas que cualquiera puede precomputar, o sea
 * guardar la IP con pasos extra. Prefiero que el comprobador no arranque a
 * que arranque guardando lo que ha prometido no guardar.
 */
export function hashIp(ip: string, salt: string | undefined): string {
  if (!salt) {
    throw new Error("PUBLIC_CHECK_IP_SALT is required to hash visitor IPs");
  }
  return createHash("sha256").update(`${ip}${salt}`).digest("hex");
}

/**
 * Extrae la IP del visitante de las cabeceras del proxy.
 *
 * `x-forwarded-for` es una lista y **la primera entrada es la del cliente**;
 * las siguientes son proxies intermedios. Coger la última daría siempre la
 * IP de Vercel y haría que el límite por IP contara a todo el mundo junto —
 * un fallo que se ve exactamente igual que un límite que funciona.
 *
 * Devuelve `null` si no hay ninguna cabecera utilizable. Quien llame decide
 * qué hacer con eso; este módulo no inventa una IP de relleno, porque una IP
 * de relleno compartida por todos convierte el límite por IP en un límite
 * global accidental.
 */
export function clientIpFromHeaders(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = headers.get("x-real-ip")?.trim();
  return real || null;
}

/**
 * Cuenta las tres ventanas y devuelve un veredicto. El orden de comprobación
 * es del más general al más concreto **a propósito**: si el producto ha
 * llegado a su techo, eso es lo que hay que decirle al visitante, no que su
 * dominio esté repetido — el mensaje correcto es el que explica por qué no va
 * a poder comprobar aunque cambie de dominio o de red.
 */
export async function checkPublicCheckLimits(
  service: ReturnType<typeof createServiceClient>,
  input: { ipHash: string; domain: string },
  deps: PublicCheckLimitDeps = {}
): Promise<PublicCheckLimitResult> {
  const limits = deps.limits ?? DEFAULT_PUBLIC_CHECK_LIMITS;
  const nowMs = (deps.now ?? Date.now)();
  const windowStart = new Date(nowMs - DAY_MS).toISOString();

  const countSince = async (column: "ip_hash" | "domain" | null, value?: string) => {
    let query = service
      .from("public_checks")
      .select("id", { count: "exact", head: true })
      .gte("created_at", windowStart);
    if (column && value !== undefined) query = query.eq(column, value);
    return query;
  };

  const global = await countSince(null);
  if (global.error) {
    console.error(`${LOG_PREFIX} global_lookup_failed`);
    return { allowed: false, reason: "limit_check_failed" };
  }
  const usedToday = global.count ?? 0;
  if (usedToday >= limits.globalPerDay) {
    console.warn(`${LOG_PREFIX} global_ceiling_reached`, { used: usedToday, limit: limits.globalPerDay });
    return { allowed: false, reason: "global_ceiling_reached" };
  }

  const byIp = await countSince("ip_hash", input.ipHash);
  if (byIp.error) {
    console.error(`${LOG_PREFIX} ip_lookup_failed`);
    return { allowed: false, reason: "limit_check_failed" };
  }
  if ((byIp.count ?? 0) >= limits.perIpPerDay) {
    return { allowed: false, reason: "ip_limit_reached" };
  }

  const byDomain = await countSince("domain", input.domain);
  if (byDomain.error) {
    console.error(`${LOG_PREFIX} domain_lookup_failed`);
    return { allowed: false, reason: "limit_check_failed" };
  }
  if ((byDomain.count ?? 0) >= limits.perDomainPerDay) {
    return { allowed: false, reason: "domain_limit_reached" };
  }

  return { allowed: true, usedToday, globalLimit: limits.globalPerDay };
}
