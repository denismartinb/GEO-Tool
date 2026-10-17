import Link from "next/link";
import "./agentic-pill.css";

/**
 * AGENTIC-COMMERCE-1 — the home's pill to the agentic-commerce landing,
 * above the headline. Copy approved by the founder on 2026-10-17.
 */
export function AgenticPill() {
  return (
    <Link href="/comercio-agentico?desde=portada" className="lp-agentic-pill">
      <span className="tag">Nuevo</span>
      <span className="txt">Comercio agéntico: ¿los agentes pueden comprar en tu web?</span>
      <span className="arr" aria-hidden="true">→</span>
    </Link>
  );
}
