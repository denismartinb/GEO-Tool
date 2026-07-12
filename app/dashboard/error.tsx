"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Next.js's error.tsx boundary is not auto-instrumented by
    // @sentry/nextjs — without this explicit call, a render error caught
    // here never reaches Sentry, only the browser console (lost the
    // moment the tab closes). Found via a founder-reported crash on
    // Auditoría web that Sentry had no record of.
    console.error("[dashboard] unhandled render error", { message: error.message, digest: error.digest });
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="page" style={{ display: "flex", justifyContent: "center", padding: "80px 20px" }}>
      <div style={{
        background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--r-xl)",
        padding: "40px 36px", maxWidth: 480, width: "100%", textAlign: "center", boxShadow: "var(--sh-2)"
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: "999px", margin: "0 auto 20px",
          background: "var(--neg-soft, #fdecec)", display: "grid", placeItems: "center", color: "var(--neg-ink, #c0392b)"
        }}>
          <Icon name="settings" size={24} />
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 750, color: "var(--ink)", marginBottom: 10 }}>
          Algo ha ido mal
        </h2>
        <p style={{ fontSize: 14, color: "var(--ink-3)", lineHeight: 1.65, marginBottom: 24 }}>
          No hemos podido cargar esta página. Puedes reintentarlo; si el problema persiste, contacta con soporte.
        </p>
        <Button onClick={() => reset()}>Reintentar</Button>
      </div>
    </div>
  );
}
