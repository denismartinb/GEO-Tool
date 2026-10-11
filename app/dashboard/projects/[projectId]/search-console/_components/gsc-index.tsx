import Link from "next/link";
import type { IndexSummary } from "@/lib/search-console/report";

/**
 * Indexing donut (log §283). Built from Google's URL Inspection of the pages
 * our audit already reviews (at most ten), so it speaks of those pages, never
 * of the whole site. Buckets only what Google said in words we can match;
 * the rest is "Otros motivos".
 */
const SEGMENTS = [
  { key: "indexed", label: "Indexadas", color: "#15915a" },
  { key: "crawledNotIndexed", label: "Rastreadas, sin indexar", color: "#c2570c" },
  { key: "excludedNoindex", label: "Excluidas por noindex", color: "#d23b48" },
  { key: "other", label: "Otros motivos", color: "#98a2b3" }
] as const;

export function GscIndexCard({
  index,
  uninspected,
  auditHref
}: {
  index: IndexSummary | null;
  uninspected: number;
  auditHref: string;
}) {
  return (
    <div className="card">
      <div className="sa-ch">
        <h3>Indexación</h3>
        <span className="sa-src">Inspección de URL de Google · páginas revisadas</span>
      </div>
      {index ? (
        (() => {
          let offset = 0;
          const pct = Math.round((index.indexed / index.total) * 100);
          return (
            <div className="gsc-donut-wrap">
              <div className="gsc-donut">
                <svg viewBox="0 0 120 120" aria-hidden="true">
                  <circle cx="60" cy="60" r="48" fill="none" stroke="#eef2f8" strokeWidth="14" />
                  {SEGMENTS.map((s) => {
                    const share = (index[s.key] / index.total) * 100;
                    if (share === 0) return null;
                    const el = (
                      <circle
                        key={s.key}
                        cx="60"
                        cy="60"
                        r="48"
                        fill="none"
                        stroke={s.color}
                        strokeWidth="14"
                        pathLength={100}
                        strokeDasharray={`${share} 100`}
                        strokeDashoffset={-offset}
                      />
                    );
                    offset += share;
                    return el;
                  })}
                </svg>
                <div className="gsc-donut-c">
                  <b>{pct}%</b>
                  <span>indexadas</span>
                </div>
              </div>
              <ul className="gsc-reasons">
                {SEGMENTS.filter((s) => s.key === "indexed" || index[s.key] > 0).map((s) => (
                  <li key={s.key}>
                    <i style={{ background: s.color }} />
                    <span>{s.label}</span>
                    <b>{index[s.key]}</b>
                  </li>
                ))}
              </ul>
            </div>
          );
        })()
      ) : (
        <p className="sa-empty">
          {uninspected > 0
            ? "Google no respondió a la inspección esta vez. Vuelve a abrir la pantalla en un rato."
            : "Todavía no hemos revisado páginas de tu web. Lo haremos tras el próximo escaneo."}
        </p>
      )}
      {index && uninspected > 0 && (
        <p className="sa-note" style={{ marginTop: 10 }}>
          {uninspected === 1 ? "Una página no se pudo inspeccionar" : `${uninspected} páginas no se pudieron inspeccionar`} esta
          vez.
        </p>
      )}
      <Link href={auditHref} className="btn btn-ghost btn-sm gsc-index-link">
        Ver por qué en Auditoría SEO
      </Link>
    </div>
  );
}
