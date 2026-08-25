/**
 * PRELAUNCH-HARDENING-1 Fase R4 — el contrato de entorno, como código.
 *
 * `docs/environment-contract.md` describe cada variable desde hace meses y es
 * una buena especificación. Lo que no tenía es forma de fallar: una variable
 * ausente, mal escrita o con un valor que no es lo que dice el contrato no
 * rompe nada visible, se degrada en silencio y aparece semanas después como
 * "el escaneo recurrente hace menos de lo que debería".
 *
 * Este módulo es la especificación en zod. Es **puro**: no lee `process.env`,
 * no tiene efectos, y no importa `server-only`. Eso es deliberado — así lo
 * pueden usar tanto el accesor de servidor (`lib/env.ts`) como un script de
 * node suelto (`scripts/check-env.mjs`) y los tests, sin arrastrar el runtime
 * de Next.
 *
 * **Regla de la fase: comportamiento idéntico.** Donde el contrato documenta
 * una semántica permisiva —`CRON_SCANS_ENABLED` es "true" o no-op, y cualquier
 * otro valor es un no-op igual de válido— el esquema la respeta en vez de
 * "arreglarla". Volver estricto un flag que hoy es permisivo apagaría cosas en
 * producción, que es justo lo que un refactor no puede hacer. La única
 * excepción está declarada abajo, en `positiveIntWithDefault`.
 */

import { z } from "zod";
import { isPromoActive } from "@/app/pricing/plans-data";

/**
 * Un entero positivo con valor por defecto, que **nunca produce `NaN`**.
 *
 * Ésta es la única desviación de "comportamiento idéntico" de la fase, y va
 * declarada porque corrige un fallo real. Hoy se lee así:
 *
 *     Number(process.env.MAX_SWEEP_CHAIN_INVOCATIONS ?? 20)
 *
 * Con un valor no numérico eso da `NaN`, y en `lib/scan/cron.ts` la condición
 * que decide si el barrido encadena es `chainIndex + 1 < maxChainInvocations`.
 * Cualquier comparación contra `NaN` es `false`, así que el barrido recurrente
 * **deja de encadenar del todo**: un disparo en vez de veinte, sin un error,
 * sin un log, y con la pinta de estar funcionando.
 *
 * Se cae al valor por defecto en vez de lanzar. En una ruta de cron, lanzar
 * mata el barrido entero por una variable mal escrita; caer al defecto lo deja
 * corriendo como estaba diseñado. Que no sea silencioso es trabajo de
 * `scripts/check-env.mjs`, que lo detecta antes de desplegar, y del aviso que
 * emite el accesor.
 */
export function positiveIntWithDefault(fallback: number) {
  return z
    .string()
    .optional()
    .transform((raw) => {
      if (raw === undefined || raw.trim() === "") return fallback;
      const parsed = Number(raw);
      return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
    });
}

/** Devuelve `true` si el valor es exactamente `"true"`. Semántica actual. */
const optInFlag = z
  .string()
  .optional()
  .transform((raw) => raw === "true");

/** Devuelve `false` sólo si el valor es exactamente `"false"`. Semántica actual. */
const optOutFlag = z
  .string()
  .optional()
  .transform((raw) => raw !== "false");

const optionalText = z
  .string()
  .optional()
  .transform((raw) => {
    const trimmed = raw?.trim();
    return trimmed ? trimmed : undefined;
  });

/**
 * Qué deja de funcionar cuando una variable falta o viene mal, en una frase.
 *
 * No es documentación decorativa: es lo que se imprime en el error y en el
 * informe de `check-env`. Un mensaje que dice "falta OPENAI_MODEL" obliga a
 * abrir el contrato; uno que dice qué se rompe, no.
 */
export const ENV_CONSEQUENCE: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: "sin esto no hay cliente de Supabase: ninguna página autenticada carga",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "sin esto no hay cliente de Supabase: ninguna página autenticada carga",
  SUPABASE_SERVICE_ROLE_KEY: "las tareas que saltan RLS (cron, webhooks, admin) fallan",
  NEXT_PUBLIC_SITE_URL: "las URLs absolutas caen a VERCEL_URL y luego a localhost; la auto-continuación del escaneo puede apuntar a un despliegue viejo",
  NEXT_PUBLIC_POSTHOG_KEY: "no se envía analítica de producto",
  NEXT_PUBLIC_POSTHOG_HOST: "la analítica se envía al host por defecto (UE)",
  VERCEL_URL: "la inyecta Vercel; en local no existe y se usa localhost",
  VERCEL_ENV: "la inyecta Vercel; distingue production de preview",
  GEMINI_API_KEY: "Gemini es el motor por defecto: sin clave no hay escaneo",
  GEMINI_MODEL: "se usa el modelo por defecto fijado en código",
  ANTHROPIC_API_KEY: "si Claude está en LLM_SCAN_PROVIDERS, sus llamadas fallan",
  ANTHROPIC_MODEL: "se usa el modelo por defecto fijado en código",
  OPENAI_API_KEY: "si OpenAI está en LLM_SCAN_PROVIDERS, sus llamadas fallan",
  OPENAI_MODEL: "OBLIGATORIA si hay OPENAI_API_KEY — no hay modelo por defecto a propósito",
  PUBLIC_CHECK_IP_SALT:
    "el comprobador gratuito anónimo deja de comprobar y cae a captar el dominio — a propósito: sin sal, hashear la IP no la protege",
  LLM_SCAN_PROVIDERS: "el escaneo cae a Gemini en solitario",
  LLM_SCAN_PROVIDER: "legacy: sólo se lee si LLM_SCAN_PROVIDERS no está",
  ENABLE_SYNC_SCAN_EXECUTION: "el escaneo síncrono no se ejecuta",
  SCAN_CONTINUE_SECRET: "una campaña con más prompts que el tope por invocación no puede continuarse: se queda a medias",
  MAX_SWEEP_CHAIN_INVOCATIONS: "acota cuántas veces encadena el barrido recurrente; un valor no numérico lo dejaba en uno solo, en silencio",
  MAX_PROJECTS_PER_CRON_RUN: "acota cuántos proyectos escanea cada disparo de cron",
  MAX_PROJECTS_PER_DIGEST_RUN: "acota cuántos proyectos entran en cada resumen",
  CRON_SECRET: "OBLIGATORIA con CRON_SCANS_ENABLED=true — sin ella el cron responde 401 y no escanea nada",
  CRON_SCANS_ENABLED: "interruptor del escaneo recurrente; apagado por defecto",
  CRON_DIGEST_ENABLED: "interruptor del resumen por correo; apagado por defecto",
  AUTO_WEB_AUDIT_ENABLED: "interruptor de la auditoría automática; encendido por defecto",
  OPS_ALERT_EMAIL: "los avisos de operador no se envían a nadie",
  RESEND_API_KEY: "no se envía ningún correo transaccional",
  RESEND_FROM_EMAIL: "se usa el remitente compartido de pruebas de Resend",
  STRIPE_SECRET_KEY: "no se puede cobrar ni abrir el portal de cliente",
  STRIPE_WEBHOOK_SECRET: "los webhooks de Stripe se rechazan por firma inválida",
  STRIPE_PRICE_ID_STARTER: "el checkout del plan Starter no se puede crear",
  STRIPE_PRICE_ID_PRO: "el checkout del plan Pro no se puede crear",
  STRIPE_COUPON_ID_STARTER_PROMO: "el checkout de Starter cobra el precio normal, sin la promo",
  STRIPE_COUPON_ID_PRO_PROMO: "el checkout de Pro cobra el precio normal, sin la promo",
  ADMIN_USER_IDS: "/admin es inalcanzable (404 para todo el mundo)",
  GOOGLE_SITE_VERIFICATION: "no se emite la meta de verificación de Search Console"
};

/**
 * El esquema completo. Todo es opcional a nivel de campo: lo que es
 * obligatorio, y cuándo, se decide en `ENV_RULES` más abajo — porque en este
 * producto casi nada es obligatorio a secas y casi todo lo es **en función de
 * otra variable**. Es exactamente ese "en función de" lo que hoy no está
 * escrito en ningún sitio ejecutable.
 */
export const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: optionalText,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalText,
  SUPABASE_SERVICE_ROLE_KEY: optionalText,
  NEXT_PUBLIC_SITE_URL: optionalText,
  NEXT_PUBLIC_POSTHOG_KEY: optionalText,
  NEXT_PUBLIC_POSTHOG_HOST: optionalText,
  VERCEL_URL: optionalText,
  VERCEL_ENV: optionalText,

  GEMINI_API_KEY: optionalText,
  GEMINI_MODEL: optionalText,
  ANTHROPIC_API_KEY: optionalText,
  ANTHROPIC_MODEL: optionalText,
  OPENAI_API_KEY: optionalText,
  OPENAI_MODEL: optionalText,
  PUBLIC_CHECK_IP_SALT: optionalText,
  LLM_SCAN_PROVIDERS: optionalText,
  LLM_SCAN_PROVIDER: optionalText,

  ENABLE_SYNC_SCAN_EXECUTION: optionalText,
  SCAN_CONTINUE_SECRET: optionalText,
  MAX_SWEEP_CHAIN_INVOCATIONS: positiveIntWithDefault(20),
  MAX_PROJECTS_PER_CRON_RUN: positiveIntWithDefault(5),
  MAX_PROJECTS_PER_DIGEST_RUN: positiveIntWithDefault(200),

  CRON_SECRET: optionalText,
  CRON_SCANS_ENABLED: optInFlag,
  CRON_DIGEST_ENABLED: optInFlag,
  AUTO_WEB_AUDIT_ENABLED: optOutFlag,

  OPS_ALERT_EMAIL: optionalText,
  RESEND_API_KEY: optionalText,
  RESEND_FROM_EMAIL: optionalText,

  STRIPE_SECRET_KEY: optionalText,
  STRIPE_WEBHOOK_SECRET: optionalText,
  STRIPE_PRICE_ID_STARTER: optionalText,
  STRIPE_PRICE_ID_PRO: optionalText,
  STRIPE_COUPON_ID_STARTER_PROMO: optionalText,
  STRIPE_COUPON_ID_PRO_PROMO: optionalText,

  ADMIN_USER_IDS: optionalText,
  GOOGLE_SITE_VERIFICATION: optionalText
});

export type Env = z.infer<typeof envSchema>;

/** Todas las variables que este producto lee. La usa el test de deriva. */
export const DECLARED_ENV_VARS = Object.keys(envSchema.shape) as Array<keyof Env>;

/**
 * El entorno tal cual llega, antes de validar. Deliberadamente NO es
 * `NodeJS.ProcessEnv`: ese tipo declara `NODE_ENV` obligatorio, lo que
 * obligaría a inventarlo en cada test. Lo que aquí se valida es un mapa de
 * cadenas, que es lo que de verdad llega.
 */
export type RawEnv = Record<string, string | undefined>;

export type EnvProblem = {
  variable: string;
  severity: "error" | "warning";
  message: string;
};

/**
 * Las reglas condicionales — el corazón de R4.
 *
 * Cada una es trazable a una fila de `docs/environment-contract.md`, y cada
 * una describe una configuración que hoy **arranca perfectamente y luego no
 * hace lo que promete**. Se devuelven como lista en vez de lanzar en la
 * primera: quien está configurando un despliegue quiere ver los cinco
 * problemas de una vez, no descubrirlos uno por despliegue.
 */
export function checkEnvRules(env: Env, raw: RawEnv = {}, now: Date = new Date()): EnvProblem[] {
  const problems: EnvProblem[] = [];
  const add = (variable: string, severity: EnvProblem["severity"], message: string) =>
    problems.push({ variable, severity, message });

  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    add(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "error",
      "Faltan las credenciales públicas de Supabase: ninguna página autenticada puede cargar."
    );
  }

  // Contrato, línea de OPENAI_MODEL: "Required if OPENAI_API_KEY is set — no
  // default." Es la regla condicional más afilada del contrato y hasta ahora
  // sólo existía dentro de `lib/llm/openai.ts`, donde no se ve hasta que un
  // escaneo real la pisa.
  if (env.OPENAI_API_KEY && !env.OPENAI_MODEL) {
    add("OPENAI_MODEL", "error", "Hay OPENAI_API_KEY pero no OPENAI_MODEL, y no hay modelo por defecto a propósito: cada llamada a OpenAI fallará.");
  }

  if (env.CRON_SCANS_ENABLED && !env.CRON_SECRET) {
    add("CRON_SECRET", "error", "CRON_SCANS_ENABLED=true sin CRON_SECRET: el cron responderá 401 y no escaneará nada.");
  }

  if (env.CRON_DIGEST_ENABLED && !env.CRON_SECRET) {
    add("CRON_SECRET", "error", "CRON_DIGEST_ENABLED=true sin CRON_SECRET: el resumen responderá 401.");
  }

  // Los motores declarados tienen que tener con qué llamar. Se lee la lista
  // igual que `lib/scan/providers.ts`, legacy incluido, para no inventar una
  // segunda interpretación de la misma variable.
  const engines = (env.LLM_SCAN_PROVIDERS ?? env.LLM_SCAN_PROVIDER ?? "gemini")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (engines.includes("gemini") && !env.GEMINI_API_KEY) {
    add("GEMINI_API_KEY", "error", "Gemini está en la lista de motores pero no hay clave.");
  }
  if (engines.includes("claude") && !env.ANTHROPIC_API_KEY) {
    add("ANTHROPIC_API_KEY", "error", "Claude está en la lista de motores pero no hay clave.");
  }
  if (engines.includes("openai") && !env.OPENAI_API_KEY) {
    add("OPENAI_API_KEY", "error", "OpenAI está en la lista de motores pero no hay clave.");
  }

  // Stripe: o está entero o no está. A medias es peor que apagado — se puede
  // abrir un checkout que luego ningún webhook confirma.
  const stripePieces = [
    ["STRIPE_SECRET_KEY", env.STRIPE_SECRET_KEY],
    ["STRIPE_WEBHOOK_SECRET", env.STRIPE_WEBHOOK_SECRET],
    ["STRIPE_PRICE_ID_STARTER", env.STRIPE_PRICE_ID_STARTER],
    ["STRIPE_PRICE_ID_PRO", env.STRIPE_PRICE_ID_PRO]
  ] as const;
  const stripeSet = stripePieces.filter(([, v]) => v);
  if (stripeSet.length > 0 && stripeSet.length < stripePieces.length) {
    const missing = stripePieces.filter(([, v]) => !v).map(([k]) => k);
    add("STRIPE_*", "error", `Stripe está configurado a medias: faltan ${missing.join(", ")}. Un checkout que ningún webhook confirma deja al cliente pagando sin plan.`);
  }

  // PRICING-PROMO-1: no es un error — la pantalla nunca promete un descuento
  // que el cupón no puede dar (getActivePromoPlanIds exige las dos cosas) —
  // pero si la ventana de la promo está abierta y Stripe funciona, casi
  // seguro es que alguien olvidó crear los cupones, no que la promo no lleve
  // descuento a propósito.
  if (isPromoActive(now) && stripeSet.length === stripePieces.length) {
    if (!env.STRIPE_COUPON_ID_STARTER_PROMO) {
      add("STRIPE_COUPON_ID_STARTER_PROMO", "warning", "La promo está en fecha pero sin cupón: /pricing no mostrará descuento en Starter.");
    }
    if (!env.STRIPE_COUPON_ID_PRO_PROMO) {
      add("STRIPE_COUPON_ID_PRO_PROMO", "warning", "La promo está en fecha pero sin cupón: /pricing no mostrará descuento en Pro.");
    }
  }

  // El comprobador gratuito degrada EN SILENCIO sin sal: la página sigue
  // cargando y sigue captando el dominio, así que a la vista funciona — y no
  // comprueba nada. Es el fallo exacto que `.claude/rules/scan.md` prohíbe
  // dejar invisible ("a failure the operator can fix must reach the
  // operator"): la única señal en producción sería un `console.error` en un
  // log efímero, que no es un diagnóstico.
  //
  // Aviso y no error a propósito: sin esta variable el resto del producto
  // funciona entero, así que romper el arranque castigaría a quien no usa el
  // comprobador. Lo que hace falta no es parar, es que se vea.
  if (!env.PUBLIC_CHECK_IP_SALT) {
    add(
      "PUBLIC_CHECK_IP_SALT",
      "warning",
      "El comprobador gratuito no comprobará: sin sal no se puede hashear la IP, así que degrada a captar el dominio y llevar al registro. La página parece funcionar."
    );
  }

  // Avisos: nada se rompe, pero el operador debería saberlo.
  if (!env.OPS_ALERT_EMAIL) {
    add("OPS_ALERT_EMAIL", "warning", "Sin buzón de operador: los avisos de fallo de LLM no llegan a nadie.");
  }
  if (env.RESEND_API_KEY && !env.RESEND_FROM_EMAIL) {
    add("RESEND_FROM_EMAIL", "warning", "Se enviarán correos desde el remitente compartido de pruebas de Resend.");
  }

  // Los enteros que se caen a su valor por defecto. El defecto mantiene el
  // sistema en pie (ver `positiveIntWithDefault`), pero un valor descartado en
  // silencio es justo lo que esta fase existe para hacer visible.
  for (const key of ["MAX_SWEEP_CHAIN_INVOCATIONS", "MAX_PROJECTS_PER_CRON_RUN", "MAX_PROJECTS_PER_DIGEST_RUN"] as const) {
    const rawValue = raw[key];
    if (rawValue !== undefined && rawValue.trim() !== "") {
      const parsed = Number(rawValue);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        add(key, "error", `"${rawValue}" no es un entero positivo; se usará el valor por defecto (${env[key]}) y lo que pusiste se descarta.`);
      }
    }
  }

  return problems;
}

/** Parsea y comprueba de una vez. No lee `process.env` por su cuenta. */
export function inspectEnv(raw: RawEnv, now: Date = new Date()): { env: Env; problems: EnvProblem[] } {
  const env = envSchema.parse(raw);
  return { env, problems: checkEnvRules(env, raw, now) };
}
