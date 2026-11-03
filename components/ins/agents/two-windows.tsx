import { Ic } from "@/components/ins/ic";
import { AgentKindIcon } from "@/components/ins/agents/agent-kind-icon";
import { NAV_AGENTS, READ_AGENTS } from "@/lib/agentic-audit/agent-lanes";
import type { Cell, Slot, TwoWindows } from "@/lib/agentic-audit/two-windows";

/**
 * AGENTS-BROWSER-1 PR 2 (log §454): «Con navegador y sin él» on «Auditoría
 * agéntica», from the approved mockup
 * (`docs/design-reference/agents-browser-1/maqueta-v3.html`). Every word comes
 * from `lib/agentic-audit/two-windows.ts`; this only lays it out. Server
 * component, classes prefixed `agw-` (the shell already styles `.nav`).
 */

function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname === "/" ? "" : u.pathname}`;
  } catch {
    return url;
  }
}

function Pin({ n }: { n: number | null }) {
  return n === null ? null : <span className="agw-pin">{n}</span>;
}

function ReadSlot({ slot }: { slot: Slot }) {
  if (slot.tone === "na") return null;
  if (slot.tone !== "ok")
    return (
      <span className="agw-slot agw-miss">
        {slot.text}
        <Pin n={slot.pin} />
      </span>
    );
  return (
    <span className={`agw-slot agw-s-${slot.id}`}>
      {slot.text}
      <Pin n={slot.pin} />
    </span>
  );
}

function NavSlot({ slot }: { slot: Slot }) {
  if (slot.tone === "na") return null;
  if (slot.tone === "no")
    return (
      <span className="agw-slot agw-miss">
        {slot.text}
        <Pin n={slot.pin} />
      </span>
    );
  return (
    <span className={`agw-slot agw-s-${slot.id}${slot.tone === "mid" ? " agw-soft" : ""}`}>
      {slot.text}
      <Pin n={slot.pin} />
    </span>
  );
}

function CellView({ cell }: { cell: Cell }) {
  return (
    <span className={`agw-${cell.tone}`}>
      <i className="agw-d" />
      {cell.say ? <b>{cell.say}</b> : cell.code ? <code>{cell.text}</code> : <b>{cell.text}</b>}
    </span>
  );
}

const HEAD = (
  <>
    <div className="agw-top">
      <h3>Con navegador y sin él</h3>
      <span className="agw-tag agw-tag-new">Nuevo</span>
    </div>
    <p className="agw-lead">Abrimos tu ficha de las dos formas en que llega un agente. Así la ve cada uno.</p>
  </>
);

export function TwoWindowsCard({ windows }: { windows: TwoWindows }) {
  if (windows.state !== "measured") {
    return (
      <div className="card agw">
        {HEAD}
        <p className="agw-wait">{windows.line}</p>
      </div>
    );
  }
  const url = shortUrl(windows.url);
  return (
    <div className="card agw">
      <div className="agw-top">
        <h3>Con navegador y sin él</h3>
        <span className="agw-tag agw-tag-new">Nuevo</span>
        <span className="agw-sp" />
        <span className="agw-tag agw-tag-ok">
          <Ic n="check" sm />
          Comprobado
        </span>
      </div>
      <p className="agw-lead">Abrimos tu ficha de las dos formas en que llega un agente. Así la ve cada uno.</p>

      <div className="agw-lenses">
        <div className="agw-lens agw-read">
          <div className="agw-lens-h">
            <span className="agw-av">
              <AgentKindIcon kind="read" />
            </span>
            <div>
              <b>Un agente que lee</b>
              <span>{READ_AGENTS}</span>
            </div>
          </div>
          <div className="agw-win">
            <div className="agw-bar" aria-hidden="true">
              <i />
              <i />
              <i />
              <code>HTML · {url}</code>
            </div>
            <div className="agw-pg">
              <div className="agw-img" aria-hidden="true" />
              <div className="agw-pg-b">
                {windows.rows[0].raw.tone === "ok" ? <span className="agw-nm">{windows.rows[0].raw.text}</span> : null}
                {windows.read.slots.map((s) => (
                  <ReadSlot key={s.id} slot={s} />
                ))}
              </div>
            </div>
          </div>
          <div className={`agw-foot agw-f-${windows.read.footTone}`}>
            <Ic n={windows.read.footTone === "ok" ? "check" : "x"} sm />
            {windows.read.foot}
          </div>
        </div>

        <div className="agw-lens agw-browse">
          <div className="agw-lens-h">
            <span className="agw-av">
              <AgentKindIcon kind="nav" />
            </span>
            <div>
              <b>Un agente que navega</b>
              <span>{NAV_AGENTS}</span>
            </div>
          </div>
          <div className="agw-win">
            <div className="agw-bar" aria-hidden="true">
              <i />
              <i />
              <i />
              <code>{url}</code>
            </div>
            <div className={`agw-pg${windows.nav.cookiesPin !== null ? " agw-has-ck" : ""}`}>
              <div className="agw-img" aria-hidden="true" />
              <div className="agw-pg-b">
                {windows.name ? <span className="agw-nm">{windows.name}</span> : null}
                {windows.nav.slots.map((s) => (
                  <NavSlot key={s.id} slot={s} />
                ))}
              </div>
            </div>
            {windows.nav.cookiesPin !== null ? (
              <div className="agw-ck">
                <span>Aviso de cookies</span>
                <em>Aceptar</em>
                <Pin n={windows.nav.cookiesPin} />
              </div>
            ) : null}
          </div>
          <div className={`agw-foot agw-f-${windows.nav.footTone === "ok" ? "nav" : "no"}`}>
            <Ic n={windows.nav.footTone === "ok" ? "check" : "x"} sm />
            {windows.nav.foot}
          </div>
        </div>
      </div>

      <div className="agw-top">
        <span className="agw-k">Punto por punto</span>
        <span className="agw-sp" />
        <div className="agw-legend">
          <span className="agw-l">
            <i />
            Sin navegador
          </span>
          <span className="agw-r">
            <i />
            Con navegador
          </span>
        </div>
      </div>
      <div className="agw-mx">
        {windows.rows.map((r) => (
          <div key={r.id} className={`agw-cell${r.gap ? " agw-gap" : ""}`}>
            <span className="agw-cell-k">
              {r.pin !== null ? <span className="agw-pn">{r.pin}</span> : null}
              {r.title}
              {r.note ? <small>{r.note}</small> : null}
            </span>
            <div className="agw-split">
              <CellView cell={r.raw} />
              <CellView cell={r.nav} />
            </div>
          </div>
        ))}
      </div>

      {windows.verdict ? (
        <div className="agw-verdict">
          <span className="agw-js" aria-hidden="true">
            JS
          </span>
          <div>
            <b>{windows.verdict.title}</b>
            <p>{windows.verdict.line}</p>
          </div>
        </div>
      ) : null}

      {windows.fixes.length > 0 ? (
        <>
          <span className="agw-k">Qué arreglar</span>
          <div className="agw-fixes">
            {windows.fixes.map((f, i) => (
              <div key={f.title} className="agw-fix">
                <span className="agw-n">{String(i + 1).padStart(2, "0")}</span>
                <b>{f.title}</b>
                <p>{f.line}</p>
                <span className="agw-gain">
                  {f.gains.map((g) => (
                    <span key={g}>{g}</span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : null}
      <p className="agw-note">
        <i />
        Se revisa una vez por semana, junto a «Lo que lee la IA». No cambia tu nota agéntica.
      </p>
    </div>
  );
}
