import type { Cannibalization, CtrOpportunity, DeviceView, PageView } from "@/lib/search-console/insights";
import { displayPath, isWebUrl } from "@/lib/search-console/insights";
import { fmtInt, fmtPct, fmtPosition, fmtShare } from "./format";
import { PosBadge } from "./gsc-posbadge";

/**
 * The Search Console blocks added in log §287: pages, «Te ven, pero no
 * entran», devices and two pages competing for one query. Every value comes
 * from the customer's own Search Console; URLs and queries are Google's text,
 * rendered as text. Design in docs/design-reference/search-seo-1/fase-3b/.
 */

function PageLink({ url, label }: { url: string; label?: string }) {
  if (!isWebUrl(url)) return <span>{label ?? displayPath(url)}</span>;
  return (
    <a className="gsc-plink" href={url} target="_blank" rel="noopener noreferrer">
      {label ?? displayPath(url)}
    </a>
  );
}

function AuditCell({ audit, auditHref }: { audit: PageView["audit"]; auditHref: string }) {
  if (audit.kind === "unaudited") return <span className="gsc-muted">Sin auditar</span>;
  if (audit.kind === "ok") return <span className="gsc-up">Correcta</span>;
  return (
    <a className="gsc-warn-link" href={auditHref}>
      {audit.count} {audit.count === 1 ? "problema SEO" : "problemas SEO"}
    </a>
  );
}

export function GscPages({ pages, auditHref }: { pages: PageView[]; auditHref: string }) {
  if (pages.length === 0) return null;
  return (
    <div className="card">
      <div className="sa-ch">
        <h3>Tus páginas en Google</h3>
        <span className="sa-src">Las que más visitas traen</span>
      </div>
      <div className="gsc-qt-wrap">
        <table className="gsc-qt">
          <thead>
            <tr>
              <th>Página</th>
              <th>Puesto medio</th>
              <th className="n">Clics</th>
              <th className="n gsc-hide-m">Impresiones</th>
              <th className="n gsc-hide-m">Búsquedas</th>
              <th className="gsc-hide-m">Auditoría SEO</th>
            </tr>
          </thead>
          <tbody>
            {pages.map((p) => (
              <tr key={p.page}>
                <td>
                  <PageLink url={p.page} label={p.path} />
                  <span className="gsc-show-m gsc-sub">
                    <AuditCell audit={p.audit} auditHref={auditHref} />
                  </span>
                </td>
                <td>
                  <PosBadge position={p.position} />
                </td>
                <td className="n">{fmtInt(p.clicks)}</td>
                <td className="n gsc-hide-m">{fmtInt(p.impressions)}</td>
                <td className="n gsc-hide-m">{fmtInt(p.queryCount)}</td>
                <td className="gsc-hide-m">
                  <AuditCell audit={p.audit} auditHref={auditHref} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="sa-note" style={{ marginTop: 10, marginBottom: 0 }}>
        Cruzamos cada página con tu Auditoría SEO: si una página que trae visitas tiene problemas, se ve aquí.
      </p>
    </div>
  );
}

export function GscCtr({ items }: { items: CtrOpportunity[] }) {
  return (
    <div className="card">
      <div className="sa-ch">
        <h3>Te ven, pero no entran</h3>
        <span className="sa-src">Muchas impresiones, pocos clics</span>
      </div>
      {items.length === 0 ? (
        <p className="sa-empty">Ninguna búsqueda de la página 1 se queda claramente por debajo de tus clics habituales.</p>
      ) : (
        <ul className="gsc-list">
          {items.map((o) => (
            <li key={o.query}>
              <PosBadge position={o.position} />
              <div>
                <b className="gsc-qq">{o.query}</b>
                <span className="gsc-sub">
                  {fmtInt(o.impressions)} impresiones · entra el {fmtPct(o.ctr)} (en ese tramo, tus otras búsquedas
                  reciben el {fmtPct(o.benchmark)})
                </span>
                {o.page ? (
                  <span className="gsc-act">
                    Reescribe el título y la descripción de <PageLink url={o.page} />
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="sa-note" style={{ marginTop: 10, marginBottom: 0 }}>
        Ya sales arriba, pero el resultado no convence. Cambiar el título y la descripción es lo más rápido para ganar
        visitas sin subir de puesto.
      </p>
    </div>
  );
}

function puestos(n: number): string {
  return `${fmtPosition(n)} ${n === 1 ? "puesto" : "puestos"}`;
}

export function GscDevices({ devices }: { devices: DeviceView[] }) {
  if (devices.length === 0) return null;
  const mobile = devices.find((d) => d.device === "mobile");
  const desktop = devices.find((d) => d.device === "desktop");
  const gap = mobile && desktop ? Math.round((mobile.position - desktop.position) * 10) / 10 : null;
  return (
    <div className="card">
      <div className="sa-ch">
        <h3>Móvil y ordenador</h3>
        <span className="sa-src">Puesto medio por dispositivo</span>
      </div>
      <div className="gsc-devs">
        {devices.map((d) => (
          <div key={d.device} className="gsc-dev">
            <span className="gsc-sub">
              {d.label} · {fmtShare(d.impressionShare)} de las impresiones
            </span>
            <b>{fmtPosition(d.position)}</b>
            <span className="gsc-sub">CTR {fmtPct(d.ctr)}</span>
          </div>
        ))}
      </div>
      {gap !== null && Math.abs(gap) >= 1 ? (
        <p className="sa-note" style={{ marginTop: 10, marginBottom: 0 }}>
          {gap > 0
            ? `En móvil sales ${puestos(gap)} más abajo que en ordenador. Revisa la velocidad en móvil en tu Auditoría SEO.`
            : `En móvil sales ${puestos(Math.abs(gap))} más arriba que en ordenador.`}
        </p>
      ) : null}
    </div>
  );
}

export function GscCannibal({ items }: { items: Cannibalization[] }) {
  return (
    <div className="card">
      <div className="sa-ch">
        <h3>Dos páginas compiten por la misma búsqueda</h3>
        <span className="sa-src">Canibalización</span>
      </div>
      {items.length === 0 ? (
        <p className="sa-empty">Ninguna búsqueda reparte sus impresiones entre varias de tus páginas.</p>
      ) : (
        <ul className="gsc-list">
          {items.map((c) => (
            <li key={c.query}>
              <div>
                <b className="gsc-qq">{c.query}</b>
                {c.pages.map((p) => (
                  <span key={p.page} className="gsc-sub">
                    <PageLink url={p.page} label={p.path} /> · puesto {fmtPosition(p.position)} · {fmtShare(p.share)} de
                    las impresiones
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="sa-note" style={{ marginTop: 10, marginBottom: 0 }}>
        Cuando Google no sabe qué página enseñar, las dos se quedan más abajo. Enlaza la secundaria a la principal o
        junta las dos.
      </p>
    </div>
  );
}
