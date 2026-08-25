import { describe, expect, it } from "vitest";
import { checkEnvRules, envSchema, inspectEnv, positiveIntWithDefault, type RawEnv } from "./env-schema";

/** Un entorno mínimo que no dispara ningún error, para partir de él. */
function healthy(overrides: RawEnv = {}): RawEnv {
  return {
    NEXT_PUBLIC_SUPABASE_URL: "https://ref.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
    GEMINI_API_KEY: "AIza-test",
    OPS_ALERT_EMAIL: "ops@example.com",
    ...overrides
  };
}

function errorsFor(raw: RawEnv): string[] {
  return inspectEnv(raw)
    .problems.filter((p) => p.severity === "error")
    .map((p) => p.variable);
}

describe("positiveIntWithDefault", () => {
  const schema = positiveIntWithDefault(20);

  it("acepta un entero positivo", () => {
    expect(schema.parse("7")).toBe(7);
  });

  it("cae al valor por defecto cuando falta o viene vacío", () => {
    expect(schema.parse(undefined)).toBe(20);
    expect(schema.parse("   ")).toBe(20);
  });

  it("NUNCA devuelve NaN — el fallo que motiva la fase", () => {
    // `Number("veinte")` es NaN, y en lib/scan/cron.ts la condición que decide
    // si el barrido encadena es `chainIndex + 1 < maxChainInvocations`.
    // Cualquier comparación contra NaN es false, así que el barrido recurrente
    // se quedaba en un solo disparo, sin error y sin log.
    expect(schema.parse("veinte")).toBe(20);
    expect(Number.isNaN(schema.parse("veinte"))).toBe(false);
  });

  it("rechaza cero, negativos y decimales, que tampoco acotan nada", () => {
    expect(schema.parse("0")).toBe(20);
    expect(schema.parse("-3")).toBe(20);
    expect(schema.parse("2.5")).toBe(20);
  });
});

describe("banderas", () => {
  it("las de opt-in sólo se encienden con exactamente \"true\"", () => {
    expect(envSchema.parse(healthy({ CRON_SCANS_ENABLED: "true" })).CRON_SCANS_ENABLED).toBe(true);
    // Semántica ACTUAL, conservada a propósito: el contrato dice que cualquier
    // otro valor es un no-op. Volverla estricta apagaría cosas en producción, y
    // un refactor no puede hacer eso.
    expect(envSchema.parse(healthy({ CRON_SCANS_ENABLED: "TRUE" })).CRON_SCANS_ENABLED).toBe(false);
    expect(envSchema.parse(healthy()).CRON_SCANS_ENABLED).toBe(false);
  });

  it("las de opt-out sólo se apagan con exactamente \"false\"", () => {
    expect(envSchema.parse(healthy()).AUTO_WEB_AUDIT_ENABLED).toBe(true);
    expect(envSchema.parse(healthy({ AUTO_WEB_AUDIT_ENABLED: "false" })).AUTO_WEB_AUDIT_ENABLED).toBe(false);
    expect(envSchema.parse(healthy({ AUTO_WEB_AUDIT_ENABLED: "nope" })).AUTO_WEB_AUDIT_ENABLED).toBe(true);
  });

  it("trata una cadena vacía como ausencia", () => {
    expect(envSchema.parse(healthy({ OPS_ALERT_EMAIL: "   " })).OPS_ALERT_EMAIL).toBeUndefined();
  });
});

describe("reglas condicionales", () => {
  it("un entorno sano no reporta ningún error", () => {
    expect(errorsFor(healthy())).toEqual([]);
  });

  it("OPENAI_API_KEY sin OPENAI_MODEL es un error, porque no hay modelo por defecto", () => {
    expect(errorsFor(healthy({ OPENAI_API_KEY: "sk-test" }))).toContain("OPENAI_MODEL");
    expect(errorsFor(healthy({ OPENAI_API_KEY: "sk-test", OPENAI_MODEL: "gpt-4o-mini" }))).toEqual([]);
  });

  it("el cron encendido sin secreto es un error: respondería 401 y no escanearía", () => {
    expect(errorsFor(healthy({ CRON_SCANS_ENABLED: "true" }))).toContain("CRON_SECRET");
    expect(errorsFor(healthy({ CRON_SCANS_ENABLED: "true", CRON_SECRET: "s3cr3t" }))).toEqual([]);
  });

  it("el resumen encendido sin secreto también", () => {
    expect(errorsFor(healthy({ CRON_DIGEST_ENABLED: "true" }))).toContain("CRON_SECRET");
  });

  it("un motor declarado sin su clave es un error", () => {
    expect(errorsFor(healthy({ LLM_SCAN_PROVIDERS: "gemini,claude" }))).toContain("ANTHROPIC_API_KEY");
    expect(
      errorsFor(healthy({ LLM_SCAN_PROVIDERS: "gemini,claude", ANTHROPIC_API_KEY: "sk-ant" }))
    ).toEqual([]);
  });

  it("lee la lista de motores igual que el producto, legacy incluido", () => {
    // lib/scan/providers.ts: LLM_SCAN_PROVIDER sólo se mira si no hay plural.
    expect(errorsFor(healthy({ LLM_SCAN_PROVIDER: "openai" }))).toContain("OPENAI_API_KEY");
    expect(
      errorsFor(healthy({ LLM_SCAN_PROVIDERS: "gemini", LLM_SCAN_PROVIDER: "openai" }))
    ).toEqual([]);
  });

  it("Stripe a medias es un error; entero o ausente, no", () => {
    expect(errorsFor(healthy())).toEqual([]);
    expect(errorsFor(healthy({ STRIPE_SECRET_KEY: "sk_test" }))).toContain("STRIPE_*");
    expect(
      errorsFor(
        healthy({
          STRIPE_SECRET_KEY: "sk_test",
          STRIPE_WEBHOOK_SECRET: "whsec",
          STRIPE_PRICE_ID_STARTER: "price_a",
          STRIPE_PRICE_ID_PRO: "price_b"
        })
      )
    ).toEqual([]);
  });

  it("PRICING-PROMO-1: avisa (no error) si la promo está en fecha, Stripe funciona y falta un cupón", () => {
    const stripeConfigured = {
      STRIPE_SECRET_KEY: "sk_test",
      STRIPE_WEBHOOK_SECRET: "whsec",
      STRIPE_PRICE_ID_STARTER: "price_a",
      STRIPE_PRICE_ID_PRO: "price_b"
    };
    const duringPromo = new Date("2026-08-25T00:00:00Z");
    const afterPromo = new Date("2026-09-02T00:00:00Z");
    const promoVars = ["STRIPE_COUPON_ID_STARTER_PROMO", "STRIPE_COUPON_ID_PRO_PROMO"];
    // Sólo las dos variables de la promo — healthy() ya dispara otros avisos
    // ajenos (PUBLIC_CHECK_IP_SALT) que no vienen a cuento aquí.
    const promoWarningsFor = (raw: RawEnv, now: Date) =>
      inspectEnv(raw, now)
        .problems.filter((p) => p.severity === "warning" && promoVars.includes(p.variable))
        .map((p) => p.variable);

    expect(promoWarningsFor(healthy(stripeConfigured), duringPromo)).toEqual(
      expect.arrayContaining(promoVars)
    );
    expect(errorsFor(healthy(stripeConfigured))).toEqual([]); // sigue sin ser error

    expect(
      promoWarningsFor(
        healthy({ ...stripeConfigured, STRIPE_COUPON_ID_STARTER_PROMO: "promo_a", STRIPE_COUPON_ID_PRO_PROMO: "promo_b" }),
        duringPromo
      )
    ).toEqual([]);

    // fuera de la ventana, aunque falten los cupones, no hay nada que avisar
    expect(promoWarningsFor(healthy(stripeConfigured), afterPromo)).toEqual([]);

    // Stripe ni siquiera configurado: ese caso ya es el error STRIPE_* de arriba
    expect(promoWarningsFor(healthy(), duringPromo)).toEqual([]);
  });

  it("faltar Supabase es un error", () => {
    const { NEXT_PUBLIC_SUPABASE_URL: _omitted, ...withoutUrl } = healthy();
    expect(errorsFor(withoutUrl)).toContain("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
  });

  it("un entero mal escrito se reporta en vez de descartarse en silencio", () => {
    const problems = inspectEnv(healthy({ MAX_SWEEP_CHAIN_INVOCATIONS: "veinte" })).problems;
    const problem = problems.find((p) => p.variable === "MAX_SWEEP_CHAIN_INVOCATIONS");
    expect(problem?.severity).toBe("error");
    expect(problem?.message).toContain("20");
  });

  it("sin buzón de operador avisa, pero no es un error", () => {
    const { OPS_ALERT_EMAIL: _omitted, ...withoutInbox } = healthy();
    const problems = checkEnvRules(envSchema.parse(withoutInbox), withoutInbox);
    const problem = problems.find((p) => p.variable === "OPS_ALERT_EMAIL");
    expect(problem?.severity).toBe("warning");
  });
});
