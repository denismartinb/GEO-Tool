/**
 * AGENTS-BROWSER-1 (log §455): the two kinds of agent told apart by their
 * icon, not by the card around them (Denis: «homogéneos, la diferenciación en
 * los iconos»). Reading agent: a page of raw HTML with a line scanning it.
 * Browsing agent: a browser window with a cursor that clicks. The movement is
 * ambient, codes nothing, and stands still with reduced motion.
 */
export function AgentKindIcon({ kind }: { kind: "read" | "nav" }) {
  if (kind === "read")
    return (
      <svg className="agk agk-read" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path className="agk-ln" d="M6 2.75h8.5L19 7.25V20a1.25 1.25 0 0 1-1.25 1.25H6A1.25 1.25 0 0 1 4.75 20V4A1.25 1.25 0 0 1 6 2.75Z" />
        <path className="agk-ln" d="M14.25 3v4.5H19" />
        <path className="agk-code" d="M9.5 11.5 7.75 13.5l1.75 2M14.5 11.5l1.75 2-1.75 2M12.75 10.75l-1.5 5.5" />
        <rect className="agk-scan" x="6" y="9" width="12" height="1.4" rx=".7" />
      </svg>
    );
  return (
    <svg className="agk agk-nav" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect className="agk-ln" x="2.75" y="4" width="18.5" height="15" rx="2.25" />
      <path className="agk-ln" d="M2.75 8h18.5" />
      <circle className="agk-fill" cx="5.4" cy="6" r=".75" />
      <circle className="agk-fill" cx="7.6" cy="6" r=".75" />
      <circle className="agk-tap" cx="12" cy="13" r="2.4" />
      <path className="agk-cur" d="M11.5 12.2v7.1l1.9-1.7 1.3 2.8 1.3-.6-1.3-2.7h2.6Z" />
    </svg>
  );
}
