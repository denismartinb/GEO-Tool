import { EngineLogo } from "@/components/ins/kit/engine";
import type { AgenticCheckResult } from "@/lib/agentic-audit/api-contract";
import { enterLine, shoppingAgentAdvice, shoppingAgentRows, type FindState } from "@/lib/agentic-audit/shopping-agents";

/**
 * «Agentes que compran» on «Visibilidad en agentes» (AGENTIC-SHOPPERS-1, log
 * §427). Every word comes from `lib/agentic-audit/shopping-agents.ts`; this
 * only lays it out. Server component: nothing here is interactive.
 */

const FIND_TONE: Record<FindState, string> = { yes: "ok", blocked: "bad", unknown: "na", hidden: "na" };

export function ShoppingAgentsCard({ result }: { result: AgenticCheckResult }) {
  const rows = shoppingAgentRows(result);
  const enter = enterLine(result);
  const advice = shoppingAgentAdvice(result);
  return (
    <div className="card agx-shop">
      <div className="card-h">
        <h3>Agentes que compran</h3>
        <span className="agx-shop-meta">según tu robots.txt y nuestra visita</span>
      </div>
      <div className="card-b">
        <ul className="agx-shop-list">
          {rows.map((row) => (
            <li key={row.id}>
              <span className="agx-shop-logo" aria-hidden="true">
                {row.logo ? <EngineLogo provider={row.logo} size={20} /> : <b>{row.name.charAt(0)}</b>}
              </span>
              <span className="agx-shop-tx">
                <b>{row.name}</b>
                <small>{row.hint ? `${row.maker} · ${row.hint}` : row.maker}</small>
              </span>
              <span className={`agx-pill ${FIND_TONE[row.finds]}`}>{row.findsWord}</span>
            </li>
          ))}
        </ul>
        <div className="agx-shop-enter" data-state={enter.state}>
          <span className="agx-shop-enter-h">
            Para entrar <span className={`agx-pill ${enter.state === "open" ? "ok" : enter.state === "challenge" ? "warn" : "na"}`}>{enter.word}</span>
          </span>
          <p>
            {enter.line} Cuando un agente entra a comprar por alguien no consulta robots.txt: lo frena o lo deja pasar tu
            protección anti-bots.
          </p>
        </div>
        {advice.length > 0 ? (
          <ul className="agx-shop-advice">
            {advice.map((a) => (
              <li key={a.id}>
                <b>{a.title}</b>
                <span>{a.body}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
