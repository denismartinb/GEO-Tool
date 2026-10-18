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
 *
 * It is framed as a quick, high-level reading of one page: the console
 * teaser below says what the console audit adds (what is still to come
 * carries «Próximamente»), and the closing CTA invites a free Pro trial and
 * says the agentic audit is already in the Pro console (log §318, §322).
 */

const CONSOLE_FEATURES: Array<{ title: string; text: string; rows: number; soon?: boolean }> = [
  { title: "Tu ficha, revisada a fondo", text: "Guarda una ficha y revísala cuando quieras: cada señal con su estado y lo que falla.", rows: 3 },
  { title: "Qué hacer primero", text: "Lo que más sube tu nota y la nota que tendrías al arreglarlo.", rows: 3 },
  { title: "Preguntas de compra", text: "Si ChatGPT, Gemini, Claude y Perplexity te recomiendan cuando alguien quiere comprar.", rows: 2, soon: true },
  { title: "Varias fichas a la vez", text: "Las fichas de tu tienda que ya revisa la auditoría técnica, en una tabla.", rows: 2, soon: true }
];

const DESCRIPTIONS: Record<AgenticComponentId | "interop", string> = {
  discovery: "Si un agente puede entrar en tu web: tu robots.txt, si tu protección anti-bots le deja pasar y si publicas sitemap.",
  understanding:
    "Si entiende qué vendes sin adivinar: precio, disponibilidad, identificadores y datos estructurados que se leen sin JavaScript.",
  trust: "Si un agente puede fiarse de ti y explicárselo a su usuario: envío, devoluciones, reseñas y quién está detrás de la tienda.",
  purchase: "Si puede llegar a comprar o reservar sin chocar: botón de compra, captchas y métodos de pago rápidos.",
  interop:
    "Si tienes un canal directo para que los agentes consulten tu catálogo y compren sin pasar por la web: UCP, MCP, la tarjeta de agente A2A y un catálogo público."
};

const STATE_TEXT: Record<CheckState, string> = {
  pass: "Correcto",
  avg: "Mejorable",
  fail: "Falla",
  unknown: "No se pudo medir"
};

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

export function AgenticResultView({
  result,
  play = true,
  onTryProduct
}: {
  result: AgenticCheckResult;
  play?: boolean;
  /** Takes the visitor back to the field to paste a product page. */
  onTryProduct?: () => void;
}) {
  const [selected, setSelected] = useState<AgenticComponentId | "interop">("discovery");

  const showTotal = result.pageRead && result.pageKind === "product" && result.score !== null;
  // All five always show: one that cannot be measured here says why instead of disappearing.
  const components = result.components;
  const emptyReason = result.pageRead
    ? "Se mide en una página donde vendas algo."
    : "No se pudo medir: la protección anti-bots no nos dejó leer la página.";
  const interopValue = result.interop.total > 0 ? (result.interop.found / result.interop.total) * 100 : 0;
  const interopLabel = `${result.interop.found}/${result.interop.total}`;
  const interopText = `${result.interop.found} de ${result.interop.total} protocolos publicados`;
  const current: AgenticComponentResult | undefined = components.find((c) => c.id === selected);
  const fixes = result.fixes.slice(0, 5);
  const facts = result.facts;
  const factChips = facts
    ? [facts.productName, facts.price, facts.availability, facts.rating ? `Valoración media ${facts.rating}` : null].filter(
        (v): v is string => Boolean(v)
      )
    : [];

  return (
    <div className="ca-res">
      <span className="ca-res-kicker">Comprobación rápida de una página</span>
      <div className="ca-res-head">
        <div>
          <b className="ca-res-dom">{result.domain}</b>
          <span className="ca-res-url">{result.url}</span>
        </div>
        {result.platform ? <span className="ca-chip ca-c-blue">{result.platform}</span> : null}
      </div>
      {factChips.length > 0 ? (
        <div className="ca-res-facts" aria-label="Lo que leímos en la página">
          {factChips.map((chip) => (
            <span key={chip}>{chip}</span>
          ))}
        </div>
      ) : null}

      {!result.pageRead ? (
        <p className="ca-res-note ca-res-note-bad">
          El dominio {result.domain} tiene una protección anti-bots que ha impedido analizar todos los componentes de visibilidad
          agéntica. Hay agentes verificados que sí podrán leerla, pero generalmente este tipo de medidas empeoran la optimización
          del comercio agéntico en tu tienda.
        </p>
      ) : result.pageKind === "other" ? (
        <div className="ca-res-note ca-res-note-act">
          <p>En esta página no vemos nada a la venta. Para la nota completa, prueba con un producto, un servicio o tu página de precios.</p>
          {onTryProduct ? (
            <button type="button" className="ca-nbtn ca-pri" onClick={onTryProduct}>
              Probar con otra página
            </button>
          ) : null}
        </div>
      ) : null}

      {showTotal ? (
        <div className="ca-res-total">
          <Gauge value={result.score as number} big play={play} />
          <div>
            <span className="ca-res-total-k">Visibilidad agéntica</span>
            <span className="ca-res-total-v">{result.score} de 100</span>
            <p className="ca-res-lead">
              Una primera lectura de alto nivel: cómo ve un agente esta página. La auditoría de la consola la repite sola tras cada escaneo.
            </p>
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
            {c.checks.length === 0 ? <small className="ca-g-sub">{result.pageRead ? "Al vender" : "Sin medir"}</small> : null}
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
              <p className="ca-res-empty">{current.checks.length === 0 ? emptyReason : "No se pudo medir."}</p>
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
          <h4 className="ca-res-h">Lo primero que arreglaría</h4>
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

      <div className="ca-more">
        <h3>En la consola lo verás todo en detalle</h3>
        <p>Esto es una muestra. Con GenScore Pro tienes la auditoría agéntica en tu consola y te decimos qué cambiar primero.</p>
        <div className="ca-feats">
          {CONSOLE_FEATURES.map((feature) => (
            <div className="ca-feat" key={feature.title}>
              <h4>
                <span className="ca-feat-dot" aria-hidden="true" />
                {feature.title}
                {feature.soon ? <span className="ca-new">Próximamente</span> : null}
              </h4>
              <p>{feature.text}</p>
              <div className="ca-ghost" aria-hidden="true">
                {Array.from({ length: feature.rows }, (_, i) => (
                  <span key={i} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="ca-res-cta">
        <h3>Optimiza el comercio agéntico de tu web</h3>
        <p>Prueba GenScore Pro gratis durante 7 días, sin tarjeta, y prepara tu tienda para los agentes que ya compran.</p>
        <Link className="ca-res-cta-btn" href="/signup">
          Empezar gratis con Pro
        </Link>
        <small>La auditoría agéntica ya está en la consola de Pro.</small>
      </div>
    </div>
  );
}
