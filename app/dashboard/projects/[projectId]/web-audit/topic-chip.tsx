"use client";

import { useState, type CSSProperties } from "react";

/**
 * Truncated, ellipsis'd topic chip inside a matrix quadrant. `title` alone
 * (the previous approach) gives desktop hover a tooltip but is useless on
 * mobile — there is no hover, so a long prompt just reads as "¿Cuáles son
 * las p…" with no way to see the rest. Tapping now toggles the chip between
 * truncated and full text in place, so the full topic is always reachable.
 */
export function TopicChip({ topic, style }: { topic: string; style?: CSSProperties }) {
  const [expanded, setExpanded] = useState(false);

  const baseStyle: CSSProperties = {
    display: "block",
    width: "100%",
    textAlign: "left",
    fontSize: 10.5,
    fontWeight: 600,
    fontFamily: "inherit",
    background: "var(--surface)",
    border: "1px solid var(--line)",
    color: "var(--ink-2)",
    borderRadius: expanded ? 8 : 999,
    padding: "2px 8px",
    margin: "0 0 4px",
    maxWidth: "100%",
    cursor: "pointer",
    ...(expanded
      ? { overflow: "visible", whiteSpace: "normal", overflowWrap: "anywhere" }
      : { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }),
    ...style
  };

  return (
    <button
      type="button"
      title={topic}
      aria-expanded={expanded}
      onClick={() => setExpanded((v) => !v)}
      style={baseStyle}
    >
      {topic}
    </button>
  );
}
