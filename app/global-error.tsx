"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * OBSERVABILITY-1 (log §300): last-resort boundary for a render error outside
 * `/dashboard` (which has its own `error.tsx`) or in the root layout itself.
 * Like that one, Next's boundaries are not auto-instrumented by Sentry: the
 * explicit `captureException` is what makes the crash reach it (log of the
 * 2026-07-12 incident in `docs/launch-plan.md`, Fase 3).
 *
 * It replaces the root layout, so it brings its own <html>/<body> and plain
 * inline styles: globals.css and the fonts are not guaranteed to be there.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="es">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f6f7fb", color: "#0b1220" }}>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "24px 16px" }}>
          <div style={{ maxWidth: 440, textAlign: "center" }}>
            <h1 style={{ fontSize: 20, margin: "0 0 10px" }}>Algo ha ido mal</h1>
            <p style={{ fontSize: 15, lineHeight: 1.6, margin: "0 0 24px", color: "#4b5568" }}>
              No hemos podido cargar esta página. Puedes reintentarlo; si el problema persiste, escríbenos a
              soporte.
            </p>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                font: "inherit",
                fontWeight: 600,
                padding: "10px 20px",
                borderRadius: 10,
                border: 0,
                background: "#2563eb",
                color: "#fff",
                cursor: "pointer"
              }}
            >
              Reintentar
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
