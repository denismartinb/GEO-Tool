import Link from "next/link";
import "./agentic-pill.css";

/**
 * AGENTIC-COMMERCE-1: the home's pill to the agentic-commerce landing,
 * above the headline. It never wraps (founder, 2026-10-17, log §320): the
 * question always fits on one line and «Comercio agéntico:» only shows
 * where there is room for it.
 */
export function AgenticPill() {
  return (
    <Link href="/comercio-agentico?desde=portada" className="lp-agentic-pill">
      <span className="tag">Nuevo</span>
      <span className="txt">
        <span className="pre">Comercio agéntico: </span>¿Los agentes pueden comprar en tu web?
      </span>
      <span className="arr" aria-hidden="true">→</span>
    </Link>
  );
}
