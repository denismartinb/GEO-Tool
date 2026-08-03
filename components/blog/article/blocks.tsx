import type { ReactNode } from "react";
import Link from "next/link";

/**
 * GROWTH-3 Fase 3.1 — bloques de composición de artículo.
 *
 * Todo artículo del blog se compone con estos bloques en vez de escribirse
 * como prosa plana. La regla que los justifica está en
 * `docs/brand/article-design-system.md`: **ningún visual es decorativo, todos
 * son evidencia** — una captura que prueba la afirmación, un ejemplo enmarcado
 * del patrón que se enseña, o una cifra con su fuente.
 *
 * Las recetas obligatorias por tipo de contenido (qué bloques debe llevar
 * como mínimo cada artículo) se validan en `lib/blog/article-recipes.test.ts`,
 * no por convención.
 *
 * Componentes de servidor puros: cero estado, cero interactividad, cero JS
 * de cliente. Un artículo debe renderizar completo sin hidratación.
 */

/** Respuesta directa a la pregunta del titular, antes de cualquier desarrollo. Regla "answer first" de content-strategy.md §4.1. */
export function KeyTakeaway({ children, label = "Respuesta rápida" }: { children: ReactNode; label?: string }) {
  return (
    <div className="art-takeaway">
      <div className="art-takeaway-lbl">{label}</div>
      {children}
    </div>
  );
}

/**
 * Veredicto explícito cuando la respuesta honesta a "¿esto funciona?" no es
 * un sí. Existe por la regla de honestidad del proyecto: cuando no hay
 * evidencia de algo, se dice en un bloque destacado en vez de enterrarlo en
 * un párrafo.
 */
export function Verdict({
  title,
  children,
  badge = "Veredicto"
}: {
  title: string;
  children: ReactNode;
  badge?: string;
}) {
  return (
    <div className="art-verdict">
      <span className="art-verdict-badge">{badge}</span>
      <div className="art-verdict-body">
        <h4>{title}</h4>
        {children}
      </div>
    </div>
  );
}

/** Sección numerada de un playbook. El número codifica secuencia real (paso 1 → 2 → 3), no decoración. */
export function NumberedSection({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="art-numsec">
      <div className="art-numsec-h">
        <span className="art-numsec-n" aria-hidden="true">
          {n}
        </span>
        <h3>{title}</h3>
      </div>
      {children}
    </section>
  );
}

/** Una tarea concreta al cierre de cada sección numerada. Es el bloque que convierte una guía en algo ejecutable. */
export function QuickAction({ children, label = "Acción rápida" }: { children: ReactNode; label?: string }) {
  return (
    <div className="art-quick">
      <span className="art-quick-lbl">{label}</span>
      <div className="art-quick-body">{children}</div>
    </div>
  );
}

/** Cita con atribución obligatoria — sin `cite` no se puede verificar quién lo dijo, y una cita sin fuente es exactamente lo que este proyecto no publica. */
export function PullQuote({ children, cite }: { children: ReactNode; cite: string }) {
  return (
    <blockquote className="art-pull">
      <p>{children}</p>
      <cite>{cite}</cite>
    </blockquote>
  );
}

const CHECK_ICON = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M3 8.5l3.2 3.2L13 5" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Checklist renderizado — visualmente distinto de una lista de viñetas, porque "cosas que comprobar" no es lo mismo que "cosas que enumerar". */
export function Checklist({ items }: { items: ReactNode[] }) {
  return (
    <ul className="art-check">
      {items.map((item, i) => (
        <li key={i}>
          {CHECK_ICON}
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** Cifra destacada. `source` es obligatorio: una cifra sin fuente citable no se publica (content-strategy.md §4.5). */
export function Stat({
  value,
  label,
  source,
  tone = "blue"
}: {
  value: string;
  label: string;
  source: string;
  tone?: "blue" | "cyan" | "warm" | "pos" | "neg";
}) {
  return (
    <div className="art-stat">
      <div className={`art-stat-n art-tone-${tone}`}>{value}</div>
      <div className="art-stat-l">{label}</div>
      <div className="art-stat-src">{source}</div>
    </div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="art-stats">{children}</div>;
}

/** Envoltorio de tabla comparativa: contenedor con scroll horizontal propio, para que el `body` nunca scrollee en móvil. */
export function CompareTable({ children }: { children: ReactNode }) {
  return <div className="art-tablewrap">{children}</div>;
}

/** Etiqueta de estado dentro de una tabla — codifica el veredicto en forma y color, no solo en texto. */
export function Pill({ tone, children }: { tone: "si" | "no" | "neutral"; children: ReactNode }) {
  return <span className={`art-pill art-pill-${tone}`}>{children}</span>;
}

/** Bloque de código con cabecera de nombre de fichero. */
export function CodeBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="art-code">
      <div className="art-code-h">{title}</div>
      <pre>{children}</pre>
    </div>
  );
}

/** Bio de autor — señal E-E-A-T visible, no solo un dato en el JSON-LD. */
export function AuthorBio({
  name = "Equipo GenScore",
  initial = "G",
  children
}: {
  name?: string;
  initial?: string;
  children: ReactNode;
}) {
  return (
    <div className="art-bio">
      <span className="art-avatar" aria-hidden="true">
        {initial}
      </span>
      <div>
        <h4>{name}</h4>
        {children}
      </div>
    </div>
  );
}

/** Cierre del artículo. Usa `next/link` para navegación interna del router. */
export function ArticleCta({
  title,
  text,
  cta = "Analiza tu dominio",
  href = "/signup"
}: {
  title: string;
  text: string;
  cta?: string;
  href?: string;
}) {
  return (
    <div className="art-cta">
      <div className="art-cta-glow" aria-hidden="true" />
      <div className="art-cta-body">
        <h3>{title}</h3>
        <p>{text}</p>
        <Link className="art-btn" href={href}>
          {cta}
        </Link>
      </div>
    </div>
  );
}
