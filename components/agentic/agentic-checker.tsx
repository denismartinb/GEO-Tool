"use client";

import { useRef, useState } from "react";
import { AgenticResultView } from "@/components/agentic/agentic-result-view";
import { AgenticScan } from "@/components/agentic/agentic-scan";
import type { AgenticCheckResponse, AgenticCheckResult } from "@/lib/agentic-audit/api-contract";
import { scanTargetFromInput, type ScanTarget } from "@/lib/agentic-audit/scan-script";

/**
 * AGENTIC-COMMERCE-1: the free agentic checker on `/comercio-agentico`.
 *
 * It accepts a product page or a bare domain and asks
 * `/api/comercio-agentico/comprobar`. The wait (`AgenticScan`) plays for
 * about ten seconds and fills in with the store's own data once the response
 * is in; it shows what is being checked, never a percentage, because nothing
 * here knows how far the server has gone. An error ends it at once, and with
 * reduced motion the result shows as soon as it arrives.
 */

type State =
  | { kind: "idle" }
  | { kind: "invalid" }
  | { kind: "checking"; target: ScanTarget | null; result: AgenticCheckResult | null }
  | { kind: "done"; response: AgenticCheckResponse }
  | { kind: "network" };

export const AGENTIC_FAILURE_COPY: Record<string, string> = {
  invalid_url: "Esa dirección no parece una web. Prueba con algo como tutienda.es/una-ficha-de-producto.",
  site_unreachable:
    "No hemos podido abrir esa página. Comprueba que la dirección es pública y empieza por tu dominio.",
  ip_limit_reached: "Ya has hecho las comprobaciones de hoy desde esta conexión. Vuelve mañana.",
  domain_limit_reached: "Esa tienda ya se ha comprobado las veces que permitimos hoy. Vuelve mañana.",
  global_ceiling_reached: "Ahora mismo no podemos hacer más comprobaciones. Inténtalo más tarde.",
  limit_check_failed: "Ahora mismo no podemos hacer la comprobación. Inténtalo más tarde.",
  network: "No hemos podido conectar. Inténtalo de nuevo en un momento."
};

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

function looksLikeAddress(value: string) {
  const v = value.trim();
  return v.length > 3 && v.includes(".") && !/\s/.test(v);
}

export function AgenticChecker() {
  const [state, setState] = useState<State>({ kind: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = inputRef.current?.value ?? "";
    if (!looksLikeAddress(value)) {
      setState({ kind: "invalid" });
      return;
    }
    const target = prefersReducedMotion() ? null : scanTargetFromInput(value);
    setState({ kind: "checking", target, result: null });
    try {
      const res = await fetch("/api/comercio-agentico/comprobar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: value.trim() })
      });
      const body = (await res.json()) as AgenticCheckResponse;
      if (body.status === "completed" && target) setState({ kind: "checking", target, result: body });
      else setState({ kind: "done", response: body });
    } catch {
      setState({ kind: "network" });
    }
  }

  const checking = state.kind === "checking";
  let message: string | null = null;
  if (state.kind === "invalid") message = AGENTIC_FAILURE_COPY.invalid_url;
  if (state.kind === "network") message = AGENTIC_FAILURE_COPY.network;
  if (state.kind === "done" && state.response.status === "failed") message = AGENTIC_FAILURE_COPY[state.response.error];
  if (state.kind === "done" && state.response.status === "degraded") message = AGENTIC_FAILURE_COPY[state.response.reason];

  return (
    <div className="ca-checker" id="comprobar">
      <form className="ca-field" onSubmit={onSubmit} noValidate>
        <input
          ref={inputRef}
          aria-label="Dirección de tu tienda o de una ficha de producto"
          placeholder="tutienda.es/una-ficha-de-producto"
          inputMode="url"
          autoComplete="url"
          autoCapitalize="none"
          spellCheck={false}
          name="url"
          id="ca-check-input"
        />
        <button type="submit" disabled={checking} aria-busy={checking}>
          {checking ? "Comprobando…" : "Comprobar mi tienda"}
        </button>
      </form>

      <div aria-live="polite">
        {state.kind === "checking" && state.target ? (
          <AgenticScan
            target={state.target}
            result={state.result}
            onDone={() => setState((s) => (s.kind === "checking" && s.result ? { kind: "done", response: { status: "completed", ...s.result } } : s))}
          />
        ) : checking ? (
          <div className="ca-wait">
            <span className="ca-wait-orb" aria-hidden="true" />
            <div>
              <b>Entrando en tu web como lo haría un agente</b>
              <span>Leemos tu robots.txt, la página, sus datos de producto y los protocolos para agentes.</span>
            </div>
          </div>
        ) : null}
        {message ? <p className="ca-err">{message}</p> : null}
        {state.kind === "done" && state.response.status === "completed" ? (
          <AgenticResultView result={state.response} />
        ) : null}
      </div>
    </div>
  );
}
