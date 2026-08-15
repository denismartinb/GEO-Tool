import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * PRELAUNCH-HARDENING-1 Fase Q2 — los correos transaccionales.
 *
 * 765 líneas, trece funciones de envío y **ni un test** (riesgo #8 del plan).
 * Es el único módulo del repositorio cuyo fallo **llega a la bandeja de un
 * cliente y no se puede deshacer**: un despliegue malo se revierte, un correo
 * enviado no.
 *
 * Lo que se fija aquí es a QUIÉN va cada cosa, CUÁNDO no se manda nada, y que
 * **nada de esto pueda tumbar el flujo al que va enganchado**. Deliberadamente
 * no se fija el maquetado: el HTML de un correo se retoca a menudo y clavarlo
 * en un test sólo produce rojos que nadie lee. Lo que se comprueba del cuerpo
 * es lo que sería un fallo real — que el dato prometido esté, y que lo que
 * viene de fuera vaya escapado.
 */

type SendResult = { error: { message: string } | null };
const send = vi.fn(async (_payload: unknown): Promise<SendResult> => ({ error: null }));
let clientAvailable = true;

vi.mock("@/lib/email/resend", () => ({
  getResendClient: () => (clientAvailable ? { emails: { send } } : null),
  getEmailFromAddress: () => "GenScore <no-reply@genscore.es>"
}));

import {
  isOpsAlertConfigured,
  sendLlmIncidentAlertEmail,
  sendNewSignupOpsAlertEmail,
  sendPaymentFailedEmail,
  sendScanHealthAlertEmail,
  sendScoreDropAlertEmail,
  sendWebAuditFailedAlertEmail,
  sendWelcomeEmail
} from "./transactional";

const CUSTOMER = "cliente@ejemplo.com";
const OPS = "ops@genscore.es";

function lastPayload() {
  return send.mock.calls.at(-1)?.[0] as { to: string; subject: string; html: string };
}

beforeEach(() => {
  vi.clearAllMocks();
  clientAvailable = true;
  send.mockResolvedValue({ error: null });
  process.env.OPS_ALERT_EMAIL = OPS;
});

afterEach(() => {
  delete process.env.OPS_ALERT_EMAIL;
});

/** Cada alerta de operador, con argumentos mínimos válidos. */
const opsAlerts: Array<[string, () => Promise<void>]> = [
  [
    "sendWebAuditFailedAlertEmail",
    () =>
      sendWebAuditFailedAlertEmail({
        domain: "ejemplo.com",
        projectId: "p1",
        runId: "r1",
        attempts: 3,
        windowMinutes: 120,
        lastError: "boom",
        failedAt: new Date("2026-08-15T10:00:00Z")
      })
  ],
  [
    "sendScanHealthAlertEmail",
    () =>
      sendScanHealthAlertEmail({
        engine: "gemini",
        reason: "quota",
        headline: "Cuota agotada",
        detail: "429",
        domain: "ejemplo.com",
        projectId: "p1",
        runId: "r1",
        affectedRows: 5,
        totalRows: 10,
        detectedAt: new Date("2026-08-15T10:00:00Z")
      })
  ],
  [
    "sendLlmIncidentAlertEmail",
    () =>
      sendLlmIncidentAlertEmail({
        surfaceLabel: "Asistente de alta",
        provider: "gemini",
        category: "quota",
        headline: "Cuota agotada",
        detail: "429",
        domain: "ejemplo.com",
        projectId: "p1",
        dedupeMinutes: 60,
        detectedAt: new Date("2026-08-15T10:00:00Z")
      })
  ],
  [
    "sendNewSignupOpsAlertEmail",
    () =>
      sendNewSignupOpsAlertEmail({
        email: CUSTOMER,
        userId: "u1",
        method: "password",
        planId: "free",
        trialEndsAt: null,
        createdAt: new Date("2026-08-15T10:00:00Z")
      })
  ]
];

describe("a quién va cada correo", () => {
  /**
   * El invariante más caro de romper de todo el módulo
   * (`.claude/rules/scan.md`): «las alertas de operador nunca van al cliente».
   * Un fallo de backend que el cliente no puede arreglar es ruido sobre el
   * problema de otro, y además le enseña las tripas del sistema.
   */
  it.each(opsAlerts)("%s va al operador, nunca al cliente", async (_name, sendAlert) => {
    await sendAlert();
    expect(lastPayload().to).toBe(OPS);
  });

  /**
   * `sendNewSignupOpsAlertEmail` es el caso peligroso: RECIBE la dirección del
   * cliente como dato del cuerpo. Confundir ese dato con el destinatario le
   * mandaría al recién registrado un aviso interno sobre sí mismo.
   */
  it("el aviso de alta nueva lleva el correo del cliente DENTRO, no como destinatario", async () => {
    await opsAlerts[3][1]();
    const payload = lastPayload();

    expect(payload.to).toBe(OPS);
    expect(payload.to).not.toBe(CUSTOMER);
    expect(payload.html).toContain(CUSTOMER);
  });

  it("los correos de cliente van a la dirección que les pasan", async () => {
    await sendWelcomeEmail(CUSTOMER);
    expect(lastPayload().to).toBe(CUSTOMER);

    await sendPaymentFailedEmail(CUSTOMER);
    expect(lastPayload().to).toBe(CUSTOMER);
  });

  /**
   * Sin destino de operador NO se manda a nadie. Caer al cliente «para que no
   * se pierda» sería exactamente el fallo que la regla prohíbe.
   */
  it.each(opsAlerts)("%s no manda nada si falta OPS_ALERT_EMAIL", async (_name, sendAlert) => {
    delete process.env.OPS_ALERT_EMAIL;
    await sendAlert();
    expect(send).not.toHaveBeenCalled();
  });

  it("una dirección de operador en blanco cuenta como no configurada", async () => {
    process.env.OPS_ALERT_EMAIL = "   ";
    await opsAlerts[0][1]();
    expect(send).not.toHaveBeenCalled();
  });
});

describe("isOpsAlertConfigured", () => {
  /**
   * REGRESIÓN — 2026-08-05. Comprobar sólo la dirección no bastaba: estaba
   * configurada, esto devolvía `true`, y `sendEmail` no-opeaba después en
   * `if (!resend) return` sin decir nada. Dos puertas silenciosas en serie es
   * justo la forma de fallo que ADR 0029 existe para quitar.
   */
  it("exige destino Y transporte, no sólo el destino", () => {
    expect(isOpsAlertConfigured()).toBe(true);

    clientAvailable = false;
    expect(isOpsAlertConfigured()).toBe(false);

    clientAvailable = true;
    delete process.env.OPS_ALERT_EMAIL;
    expect(isOpsAlertConfigured()).toBe(false);
  });
});

describe("inerte cuando no está configurado", () => {
  it("sin transporte no manda nada y no revienta", async () => {
    clientAvailable = false;
    await expect(sendWelcomeEmail(CUSTOMER)).resolves.toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });
});

describe("un correo roto no puede romper el flujo al que va enganchado", () => {
  /**
   * Estos envíos cuelgan del alta, del checkout y de la caducidad del trial.
   * Que fallen tiene que ser irrelevante para ellos: se registra y se traga.
   */
  it("un rechazo del proveedor no lanza", async () => {
    send.mockResolvedValue({ error: { message: "domain not verified" } });
    await expect(sendWelcomeEmail(CUSTOMER)).resolves.toBeUndefined();
  });

  it("una excepción de red no lanza", async () => {
    send.mockRejectedValue(new Error("ECONNRESET"));
    await expect(sendWelcomeEmail(CUSTOMER)).resolves.toBeUndefined();
    await expect(opsAlerts[0][1]()).resolves.toBeUndefined();
  });
});

describe("contenido: lo que sería un fallo de verdad", () => {
  it("el aviso de bajada publica las dos puntuaciones reales", async () => {
    await sendScoreDropAlertEmail(CUSTOMER, "ejemplo.com", 62, 41);
    const { subject, html } = lastPayload();

    expect(subject).toContain("ejemplo.com");
    expect(html).toContain("62");
    expect(html).toContain("41");
    expect(html).toContain("-21");
  });

  /**
   * El error del proveedor viene de fuera (Gemini, Supabase, fetch) y se
   * interpola en HTML. Sin escapar, una alerta sobre un fallo se convierte en
   * un vector de inyección hacia la bandeja del propio operador.
   */
  it("escapa el error del proveedor en vez de meterlo crudo", async () => {
    await sendWebAuditFailedAlertEmail({
      domain: "ejemplo.com",
      projectId: "p1",
      runId: "r1",
      attempts: 3,
      windowMinutes: 120,
      lastError: '<img src=x onerror="alert(1)">',
      failedAt: new Date("2026-08-15T10:00:00Z")
    });

    const { html } = lastPayload();
    expect(html).not.toContain('<img src=x onerror="alert(1)">');
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("todo correo sale como documento HTML completo, no como fragmento", async () => {
    await sendWelcomeEmail(CUSTOMER);
    expect(lastPayload().html.trimStart().startsWith("<!doctype html>")).toBe(true);
  });

  it("sale desde la dirección verificada, no desde una inventada", async () => {
    await sendWelcomeEmail(CUSTOMER);
    expect(send.mock.calls.at(-1)?.[0]).toMatchObject({ from: "GenScore <no-reply@genscore.es>" });
  });
});
