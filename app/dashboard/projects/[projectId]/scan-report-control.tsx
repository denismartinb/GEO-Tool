"use client";

import { useRef } from "react";
import { Icon } from "@/components/ui/icon";
import { ScanStatePill } from "@/components/scan-state-pill";
import type { ActiveScanRun } from "@/components/scan-in-progress";

/**
 * The right side of the Visión general sticky header: the scan state pill and
 * the way to the GenScore report of the latest completed scan (GEO-REPORT-1
 * Fase 2, log §250, layout approved by the founder on 2026-10-09).
 *
 * Two shapes, one per width, because the founder judged them separately:
 *  - from 900px up, a labelled "Descargar informe" button next to the pill
 *    (option B of the design review);
 *  - below 900px, no button at all: the "Escaneado <fecha>" pill itself opens
 *    a bottom sheet about that scan, with the download inside (mobile option
 *    2). A permanent button there gave a once-in-a-while action a full row.
 *
 * While a scan or an audit is running the pill tells that instead, so on
 * mobile it goes back to a plain pill until the run ends; the desktop button
 * still points at the last completed scan, which is what the report reads.
 *
 * The <dialog> hangs from the always-rendered root, never from the wrapper
 * hidden on desktop: a modal inside a `display: none` box opens at 0×0
 * (`.claude/rules/styles.md`, log §156).
 */
export function ScanReportControl({
  projectId,
  activeRun,
  lastScanLabel,
  lastScanLongLabel
}: {
  projectId: string;
  activeRun: ActiveScanRun | null;
  /** Short date for the pill, e.g. "11 sept 2026". Null without a completed scan. */
  lastScanLabel: string | null;
  /** Long date for the sheet title, e.g. "11 de septiembre de 2026". */
  lastScanLongLabel: string | null;
}) {
  const sheetRef = useRef<HTMLDialogElement>(null);
  const reportHref = `/informe/${projectId}`;
  const hasReport = lastScanLabel !== null;
  const sheetAvailable = hasReport && !activeRun;

  return (
    <div className="ov-scan-ctl">
      {hasReport ? (
        <a
          href={reportHref}
          target="_blank"
          rel="noopener"
          className="btn btn-ghost btn-sm ov-report-btn"
          style={{ padding: "5px 11px", fontSize: 12 }}
        >
          <Icon name="download" size={13} />
          Descargar informe
        </a>
      ) : null}

      {sheetAvailable ? (
        <>
          <span className="ov-scan-pill-static">
            <ScanStatePill activeRun={null} lastScanLabel={lastScanLabel} />
          </span>
          <button
            type="button"
            className="badge badge-pos ov-scan-pill-btn"
            style={{ fontSize: 11 }}
            aria-haspopup="dialog"
            onClick={() => sheetRef.current?.showModal()}
          >
            Escaneado {lastScanLabel}
            <span className="ov-scan-pill-chev" aria-hidden="true" />
          </button>
          <dialog
            ref={sheetRef}
            className="ov-scan-sheet"
            aria-labelledby="ov-scan-sheet-title"
            onClick={(e) => {
              // A click on the backdrop lands on the dialog itself.
              if (e.target === e.currentTarget) e.currentTarget.close();
            }}
          >
            <div className="ov-scan-sheet-body">
              <span className="ov-scan-sheet-grab" aria-hidden="true" />
              <h2 id="ov-scan-sheet-title" className="ov-scan-sheet-title">
                Escaneo del {lastScanLongLabel ?? lastScanLabel}
              </h2>
              <p className="ov-scan-sheet-text">
                El informe recoge los datos de este escaneo en un PDF listo para compartir.
              </p>
              <a href={reportHref} target="_blank" rel="noopener" className="btn btn-primary ov-scan-sheet-cta">
                <Icon name="download" size={14} />
                Descargar informe
              </a>
              <button type="button" className="btn btn-ghost ov-scan-sheet-close" onClick={() => sheetRef.current?.close()}>
                Cerrar
              </button>
            </div>
          </dialog>
        </>
      ) : (
        <ScanStatePill activeRun={activeRun} lastScanLabel={lastScanLabel} />
      )}
    </div>
  );
}
