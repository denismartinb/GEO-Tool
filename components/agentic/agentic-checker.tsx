"use client";

import { useRef, useState } from "react";
import { AgenticResultView } from "@/components/agentic/agentic-result-view";
import type { AgenticCheckResponse } from "@/lib/agentic-audit/api-contract";

/**
 * AGENTIC-COMMERCE-1: the free agentic checker on `/comercio-agentico`.
 *
 * It accepts a product page or a bare domain and asks
 * `/api/comercio-agentico/comprobar`. The wait shows what is being checked,
 * not a bar: the server does it in parallel and nothing here knows how far it
 * has gone, so a percentage would be invented.
 */

type State =
  | { kind: "idle" }
  | { kind: "invalid" }
  | { kind: "checking" }
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
    setState({ kind: "checking" });
    try {
      const res = await fetch("/api/comercio-agentico/comprobar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: value.trim() })
      });
      const body = (await res.json()) as AgenticCheckResponse;
      setState({ kind: "done", response: body });
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
      <p className="ca-help">Pega la dirección de una ficha de producto para medirlo todo. Gratis y sin registro.</p>

      <div aria-live="polite">
        {checking ? (
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
