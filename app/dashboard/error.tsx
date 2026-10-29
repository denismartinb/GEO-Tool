"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { ErrRing } from "@/components/ins/errors/err-ring";
import { Ic } from "@/components/ins/ic";
import { SUPPORT_EMAIL } from "@/lib/support";

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
    <div className="ins">
      <div className="page sc-err">
        <ErrRing label="!" warm />
        <div className="eyebrow bare">Error</div>
        <h1>Algo ha ido mal</h1>
        <p className="lead">
          No hemos podido cargar esta página. Tus datos están a salvo. Prueba otra vez; si sigue fallando, escríbenos
          {error.digest ? " y cita esta referencia." : "."}
        </p>
        {error.digest ? (
          <p className="er-ref">
            Referencia <span className="mono">{error.digest}</span>
          </p>
        ) : null}
        <div className="pills" style={{ justifyContent: "center" }}>
          <button type="button" className="btn ink" onClick={() => reset()}>
            <Ic n="c-refresh" sm />
            Reintentar
          </button>
          <a className="btn line" href={`mailto:${SUPPORT_EMAIL}${error.digest ? `?subject=${encodeURIComponent(`Error ${error.digest}`)}` : ""}`}>
            <Ic n="c-mail" sm />
            Escribir a soporte
          </a>
        </div>
      </div>
    </div>
  );
}
