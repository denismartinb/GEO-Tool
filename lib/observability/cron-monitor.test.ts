import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const captureCheckIn = vi.fn((..._args: unknown[]) => "check-in-id");
const captureException = vi.fn();
vi.mock("@sentry/nextjs", () => ({
  captureCheckIn: (...args: unknown[]) => captureCheckIn(...args),
  captureException: (...args: unknown[]) => captureException(...args),
  flush: async () => true
}));

import { CRON_MONITORS, isMonitoredCron, monitorSlug, withCronMonitor, type CronPath } from "./cron-monitor";

/**
 * OBSERVABILITY-1 (log §300). The monitor is only as good as its schedule: a
 * crontab that drifts from vercel.json makes Sentry report "missed" runs that
 * were never due, or stay quiet about ones that were.
 */
describe("CRON_MONITORS ↔ vercel.json", () => {
  const vercel = JSON.parse(readFileSync(path.resolve(__dirname, "../../vercel.json"), "utf8")) as {
    crons: Array<{ path: string; schedule: string }>;
  };

  it("cada cron de vercel.json tiene monitor, con el mismo horario", () => {
    for (const cron of vercel.crons) {
      expect(CRON_MONITORS[cron.path as CronPath]?.schedule, cron.path).toBe(cron.schedule);
    }
  });

  it("no hay monitores de crons que ya no existen", () => {
    expect(Object.keys(CRON_MONITORS).sort()).toEqual(vercel.crons.map((c) => c.path).sort());
  });

  it("cada ruta de cron exporta su GET envuelto en el monitor", () => {
    for (const cron of vercel.crons) {
      const file = readFileSync(path.resolve(__dirname, "../..", `app${cron.path}/route.ts`), "utf8");
      expect(file, cron.path).toContain(`withCronMonitor("${cron.path}", handleGet)`);
    }
  });
});

describe("withCronMonitor", () => {
  const SECRET = "cron-secret";
  const request = (auth = `Bearer ${SECRET}`) =>
    new Request("https://www.genscore.es/api/cron/scan-watchdog", { headers: { authorization: auth } });

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SENTRY_DSN = "https://k@o1.ingest.sentry.io/1";
    process.env.VERCEL_ENV = "production";
    process.env.CRON_SECRET = SECRET;
  });
  afterEach(() => {
    delete process.env.SENTRY_DSN;
    delete process.env.VERCEL_ENV;
    delete process.env.CRON_SECRET;
    delete process.env.SENTRY_CRON_MONITORS;
  });

  it("slug legible", () => {
    expect(monitorSlug("/api/cron/scan-watchdog")).toBe("cron-scan-watchdog");
  });

  it("200 → in_progress y luego ok, con el horario de vercel.json", async () => {
    const handler = withCronMonitor("/api/cron/scan-watchdog", async () => new Response("{}", { status: 200 }));
    const response = await handler(request());
    expect(response.status).toBe(200);
    expect(captureCheckIn).toHaveBeenCalledTimes(2);
    expect(captureCheckIn.mock.calls[0][0]).toEqual({ monitorSlug: "cron-scan-watchdog", status: "in_progress" });
    expect(captureCheckIn.mock.calls[0][1]).toMatchObject({ schedule: { type: "crontab", value: "*/15 * * * *" } });
    expect(captureCheckIn.mock.calls[1][0]).toMatchObject({ status: "ok", checkInId: "check-in-id" });
  });

  it("500 → error, y la respuesta no cambia", async () => {
    const handler = withCronMonitor("/api/cron/scan-watchdog", async () => new Response("{}", { status: 500 }));
    expect((await handler(request())).status).toBe(500);
    expect(captureCheckIn.mock.calls[1][0]).toMatchObject({ status: "error" });
  });

  it("excepción → error, se captura y se relanza", async () => {
    const boom = new Error("boom");
    const handler = withCronMonitor("/api/cron/scan-watchdog", async () => {
      throw boom;
    });
    await expect(handler(request())).rejects.toBe(boom);
    expect(captureException).toHaveBeenCalledWith(boom, { tags: { cron: "cron-scan-watchdog" } });
    expect(captureCheckIn.mock.calls[1][0]).toMatchObject({ status: "error" });
  });

  it("sin autorización, sin DSN o fuera de producción no hay check-in", async () => {
    const handler = withCronMonitor("/api/cron/scan-watchdog", async () => new Response("{}", { status: 401 }));
    await handler(request("Bearer wrong"));
    delete process.env.SENTRY_DSN;
    await handler(request());
    process.env.SENTRY_DSN = "https://k@o1.ingest.sentry.io/1";
    process.env.VERCEL_ENV = "preview";
    await handler(request());
    expect(captureCheckIn).not.toHaveBeenCalled();
  });

  it("un cron sin monitor no hace check-in, pero su excepción llega a Sentry", async () => {
    const boom = new Error("boom");
    const handler = withCronMonitor("/api/cron/scan-continue", async () => {
      throw boom;
    });
    await expect(handler(request())).rejects.toBe(boom);
    expect(captureCheckIn).not.toHaveBeenCalled();
    expect(captureException).toHaveBeenCalledWith(boom, { tags: { cron: "cron-scan-continue" } });
  });
});

/** OBSERVABILITY-2 (log §302): el plan gratuito de Sentry incluye un monitor. */
describe("isMonitoredCron", () => {
  it("por defecto sólo el vigilante", () => {
    const monitored = (Object.keys(CRON_MONITORS) as CronPath[]).filter((p) => isMonitoredCron(p, undefined));
    expect(monitored).toEqual(["/api/cron/scan-watchdog"]);
  });

  it("la variable amplía la lista, o la abre entera con all", () => {
    expect(isMonitoredCron("/api/cron/scan-continue", "scan-watchdog, scan-continue")).toBe(true);
    expect(isMonitoredCron("/api/cron/weekly-scans", "scan-watchdog,scan-continue")).toBe(false);
    expect(isMonitoredCron("/api/cron/weekly-scans", "all")).toBe(true);
    expect(isMonitoredCron("/api/cron/scan-watchdog", "  ")).toBe(true);
  });
});
