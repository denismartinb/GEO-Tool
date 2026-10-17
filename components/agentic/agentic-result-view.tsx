"use client";

import Link from "next/link";
import { useState } from "react";
import { Gauge } from "@/components/agentic/gauge";
import { Legend } from "@/components/agentic/psi-example";
import type {
  AgenticCheckResult,
  AgenticComponentId,
  AgenticComponentResult,
  CheckState
} from "@/lib/agentic-audit/api-contract";

/**
 * The real result of the agentic checker (AGENTIC-COMMERCE-1). Pure
 * presentation of `AgenticCheckResult`: every number comes from the response,
 * and what we could not measure says so («No se pudo medir»), never «Correcto».
 *
 * Interoperabilidad is shown as «N de 4 protocolos publicados» next to the
 * four scored components; it is part of the reading, not of the total.
 */

const DESCRIPTIONS: Record<AgenticComponentId | "interop", string> = {
  discovery: "Si un agente puede entrar en tu web: tu robots.txt, si tu protección anti-bots le deja pasar y si publicas sitemap.",
  understanding:
    "Si entiende qué vendes sin adivinar: precio, disponibilidad, identificadores y datos estructurados que se leen sin JavaScript.",
  trust: "Si un agente puede fiarse de ti y explicárselo a su usuario: envío, devoluciones, reseñas y quién está detrás de la tienda.",
  purchase: "Si puede llegar al pago sin chocar en la ficha: botón de compra, captchas y métodos de pago rápidos.",
  interop:
    "Si tienes un canal directo para que los agentes consulten tu catálogo y compren sin pasar por la web: UCP, MCP, la tarjeta de agente A2A y un catálogo público."
};

const STATE_TEXT: Record<CheckState, string> = {
  pass: "Correcto",
  avg: "Mejorable",
  fail: "Falla",
  unknown: "No se pudo medir"
};

const PAGE_LEVEL: AgenticComponentId[] = ["understanding", "purchase"];

function EmptyGauge({ big = false }: { big?: boolean }) {
  return (
    <span className={`ca-gw ca-info${big ? " ca-big" : ""}`} aria-label="Sin medir">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle className="ca-bg" cx="60" cy="60" r="53" />
        <circle className="ca-fg" cx="60" cy="60" r="53" />
      </svg>
      <span className="ca-v" aria-hidden="true" />
    </span>
  );
}

function stateMark(state: CheckState) {
  return state === "unknown" ? "info" : state;
}

export function AgenticResultView({ result, play = true }: { result: AgenticCheckResult; play?: boolean }) {
  const [selected, setSelected] = useState<AgenticComponentId | "interop">("discovery");

  const showTotal = result.pageRead && result.pageKind === "product" && result.score !== null;
  const hiddenComponents = new Set<AgenticComponentId>(
    !result.pageRead || result.pageKind === "product" ? [] : PAGE_LEVEL
  );
  const components = result.components.filter((c) => !hiddenComponents.has(c.id));
  const interopValue = result.interop.total > 0 ? (result.interop.found / result.interop.total) * 100 : 0;
  const interopLabel = `${result.interop.found}/${result.interop.total}`;
  const interopText = `${result.interop.found} de ${result.interop.total} protocolos publicados`;
  const current: AgenticComponentResult | undefined = components.find((c) => c.id === selected);
  const fixes = result.fixes.slice(0, 5);

  return (
    <div className="ca-res">
      <div className="ca-res-head">
        <div>
          <b className="ca-res-dom">{result.domain}</b>
          <span className="ca-res-url">{result.url}</span>
        </div>
        {result.platform ? <span className="ca-chip ca-c-blue">{result.platform}</span> : null}
      </div>

      {!result.pageRead ? (
        <p className="ca-res-note ca-res-note-bad">
          Tu web no nos dejó leer la página: es justo lo que le pasa a un agente. Lo que depende de la página sale como «No se pudo
          medir».
        </p>
      ) : result.pageKind === "other" ? (
        <p className="ca-res-note">
          Esta página no parece una ficha de producto. Comprensión y Compra se miden en una ficha: pega la dirección de una para
          medirlo todo.
        </p>
      ) : null}

      {showTotal ? (
        <div className="ca-res-total">
          <Gauge value={result.score as number} big play={play} />
          <div>
            <span className="ca-res-total-k">Visibilidad agéntica</span>
            <span className="ca-res-total-v">{result.score} de 100</span>
          </div>
        </div>
      ) : null}

      <div className="ca-psi-gauges ca-res-gauges" role="tablist" aria-label="Componentes">
        {components.map((c) => (
          <button
            key={c.id}
            type="button"
            className="ca-g"
            role="tab"
            aria-selected={selected === c.id}
            onClick={() => setSelected(c.id)}
          >
            {c.score === null ? <EmptyGauge /> : <Gauge value={c.score} play={play} />}
            <b>{c.name}</b>
          </button>
        ))}
        <button
          type="button"
          className="ca-g"
          role="tab"
          aria-selected={selected === "interop"}
          onClick={() => setSelected("interop")}
        >
          <Gauge value={interopValue} label={interopLabel} play={play} />
          <b>Interoperabilidad</b>
          <small className="ca-g-sub">{interopText}</small>
        </button>
      </div>
      <Legend />

      <div className="ca-psi-detail" role="tabpanel">
        {selected === "interop" ? (
          <>
            <div className="ca-pd-g">
              <Gauge key="interop" value={interopValue} label={interopLabel} big play={play} />
            </div>
            <div className="ca-pd-t">
              <h4 className="ca-pd-name">Interoperabilidad</h4>
              <p>{DESCRIPTIONS.interop}</p>
              <span className="ca-pd-w">{interopText}</span>
            </div>
            <ul className="ca-pd-a">
              {result.interop.items.map((item) => {
                const mark = item.state === "found" ? "pass" : item.state === "absent" ? "fail" : "info";
                return (
                  <li key={item.id}>
                    <span className={`ca-m ca-${mark}`} aria-hidden="true" />
                    <span>
                      <b className="ca-ck-l">{item.label}</b>
                      <span className="ca-ck-s">
                        {item.state === "found" ? "Publicado" : item.state === "absent" ? "Sin publicar" : "No se pudo medir"}
                        {item.detail ? `. ${item.detail}` : ""}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        ) : current ? (
          <>
            <div className="ca-pd-g">
              {current.score === null ? <EmptyGauge big /> : <Gauge key={current.id} value={current.score} big play={play} />}
            </div>
            <div className="ca-pd-t">
              <h4 className="ca-pd-name">{current.name}</h4>
              <p>{DESCRIPTIONS[current.id]}</p>
              <span className="ca-pd-w">Pesa {current.weight} de 100 puntos</span>
            </div>
            {current.checks.length > 0 ? (
              <ul className="ca-pd-a">
                {current.checks.map((check) => (
                  <li key={check.id}>
                    <span className={`ca-m ca-${stateMark(check.state)}`} aria-hidden="true" />
                    <span>
                      <b className="ca-ck-l">{check.label}</b>
                      <span className="ca-ck-s">
                        {STATE_TEXT[check.state]}
                        {check.state !== "pass" && check.state !== "unknown" && check.fix ? `. ${check.fix}` : ""}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ca-res-empty">No se pudo medir.</p>
            )}
          </>
        ) : null}
      </div>

      <div className="ca-res-grid">
        <div className="ca-res-box">
          <h4 className="ca-res-h">Asistentes que pueden entrar</h4>
          <table className="ca-res-tbl">
            <tbody>
              {result.agents.map((a) => (
                <tr key={a.assistant}>
                  <th scope="row">{a.assistant}</th>
                  <td className={a.allowed === null ? "ca-q" : a.allowed ? "ca-y" : "ca-x"}>
                    {a.allowed === null ? "No se pudo leer" : a.allowed ? "Le dejas pasar" : "Le bloqueas"}
                  </td>
                </tr>
              ))}
              <tr>
                <th scope="row">Tu web pone un reto a las visitas automáticas</th>
                <td className={result.challenge === null ? "ca-q" : result.challenge ? "ca-x" : "ca-y"}>
                  {result.challenge === null ? "No se pudo medir" : result.challenge ? "Sí" : "No"}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="ca-ex">Según tu robots.txt. El reto lo medimos con nuestro propio robot, que se identifica como tal.</p>
        </div>

        <div className="ca-res-box">
          <h4 className="ca-res-h">Qué arreglar primero</h4>
          {fixes.length > 0 ? (
            fixes.map((fix) => (
              <div className="ca-fix" key={`${fix.component}-${fix.checkId}`}>
                <span className="ca-sdot ca-s-bad" aria-hidden="true" />
                <span>{fix.label}</span>
                <span className="ca-pts">+{fix.gain}</span>
              </div>
            ))
          ) : (
            <p className="ca-res-empty">No hemos encontrado nada que arreglar en lo que pudimos medir.</p>
          )}
        </div>
      </div>

      <div className="ca-res-cta">
        <p>
          <b>¿Y la IA te nombra?</b> Prueba Pro 7 días, sin tarjeta: te decimos si ChatGPT, Gemini, Claude y Perplexity
          recomiendan tu tienda.
        </p>
        <Link className="ca-nbtn ca-pri" href="/signup">
          Probar Pro 7 días
        </Link>
      </div>
    </div>
  );
}
