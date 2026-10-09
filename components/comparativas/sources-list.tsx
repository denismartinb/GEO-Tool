import { formatIsoDateEs, uniqueSources, type Source } from "@/lib/comparativas/sources";

/**
 * Sección «Fuentes» de una comparativa (GEO-SELF-1 Fase 2, log §257): cada
 * fuente con su enlace y su fecha de consulta. Las de terceros se marcan como
 * orientativas, porque es así como la página las presenta en el texto.
 */
export function SourcesList({ sources }: { sources: Source[] }) {
  const list = uniqueSources(sources);
  if (list.length === 0) return null;
  return (
    <>
      <h2>Fuentes</h2>
      <ul>
        {list.map((s) => (
          <li key={s.url}>
            <a href={s.url} rel="nofollow noopener noreferrer" target="_blank">
              {s.label}
            </a>
            . Consultada el {formatIsoDateEs(s.consulted)}
            {s.primary ? "." : ". Fuente de terceros: dato orientativo."}
          </li>
        ))}
      </ul>
    </>
  );
}
