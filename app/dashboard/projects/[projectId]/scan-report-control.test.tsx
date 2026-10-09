import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ScanReportControl } from "./scan-report-control";

/**
 * What the Visión general header offers for the report (GEO-REPORT-1 Fase 2,
 * log §250). Which shape shows at which width is CSS (`app/console.css`);
 * these tests pin what is rendered at all.
 */

const base = {
  projectId: "p1",
  lastScanLabel: "11 sept 2026",
  lastScanLongLabel: "11 de septiembre de 2026"
};

describe("ScanReportControl", () => {
  it("renders the desktop button and the mobile pill that opens the sheet", () => {
    const html = renderToStaticMarkup(<ScanReportControl {...base} activeRun={null} />);
    expect(html).toContain('class="btn btn-ghost btn-sm ov-report-btn"');
    expect(html).toContain('href="/informe/p1"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain("<dialog");
    expect(html).toContain("Escaneo del 11 de septiembre de 2026");
  });

  it("offers no report before the first completed scan", () => {
    const html = renderToStaticMarkup(
      <ScanReportControl projectId="p1" activeRun={null} lastScanLabel={null} lastScanLongLabel={null} />
    );
    expect(html).not.toContain("/informe/");
    expect(html).not.toContain("<dialog");
  });

  it("keeps the pill plain while a scan runs, and the desktop button on the last report", () => {
    const html = renderToStaticMarkup(
      <ScanReportControl
        {...base}
        activeRun={{ status: "running", total_prompts: 10, successful_prompts: 2, failed_prompts: 0, started_at: null }}
      />
    );
    expect(html).not.toContain("<dialog");
    expect(html).toContain("Escaneando");
    expect(html).toContain("ov-report-btn");
  });
});
