import { describe, expect, it } from "vitest";
import { domainScanLabel } from "./scan-label";

const NOW = Date.parse("2026-10-27T15:00:00Z");

describe("domainScanLabel", () => {
  it("sin escaneo, el primero está pendiente", () => {
    expect(domainScanLabel(undefined, null, NOW)).toEqual({ tone: "fresh", text: "Primer escaneo pendiente" });
  });
  it("en curso y fallido", () => {
    expect(domainScanLabel("running", null, NOW).tone).toBe("run");
    expect(domainScanLabel("failed", null, NOW).tone).toBe("err");
  });
  it("hoy, ayer y hace N días", () => {
    expect(domainScanLabel("completed", "2026-10-27T06:00:00Z", NOW).text).toBe("Escaneado hoy");
    expect(domainScanLabel("completed", "2026-10-26T06:00:00Z", NOW).text).toBe("Escaneado ayer");
    expect(domainScanLabel("completed", "2026-10-22T06:00:00Z", NOW).text).toBe("Escaneado hace 5 días");
  });
});
