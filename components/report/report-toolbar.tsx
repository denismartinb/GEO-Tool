"use client";

import Link from "next/link";

/**
 * The bar above the on-screen report: print it, or go back to the console.
 * Hidden in print by geo-report.css (only `.gr-page` prints).
 *
 * If the browser has no `window.print`, the report is still there, readable
 * on screen: that is the fallback, not a modal (log §250).
 */
export function ReportToolbar({ backHref }: { backHref: string }) {
  return (
    <div className="gr-toolbar">
      <Link href={backHref} className="gr-toolbar-back">
        ← Volver a la consola
      </Link>
      <button
        type="button"
        className="gr-toolbar-print"
        onClick={() => {
          if (typeof window !== "undefined" && typeof window.print === "function") window.print();
        }}
      >
        Descargar PDF
      </button>
    </div>
  );
}
