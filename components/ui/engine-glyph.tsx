/**
 * Simplified, non-literal glyphs for each engine (Overview "Posicionamiento
 * por motores de IA", Prompts detail drawer) — not a pixel copy of any
 * provider's mark, just a recognizable stand-in per engine so these blocks
 * read at a glance. Extracted from app/dashboard/projects/[projectId]/page.tsx
 * (BRAND-5b Overview redesign) so Prompts can reuse the exact same marks.
 */
export function EngineGlyph({ provider }: { provider: string }) {
  switch (provider) {
    case "gemini":
      return (
        <svg viewBox="0 0 24 24" width="100%" height="100%">
          <defs>
            <linearGradient id="eg-gem" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#4285F4" />
              <stop offset=".5" stopColor="#9B72CB" />
              <stop offset="1" stopColor="#D96570" />
            </linearGradient>
          </defs>
          <path d="M12 1 Q13 11 23 12 Q13 13 12 23 Q11 13 1 12 Q11 11 12 1 Z" fill="url(#eg-gem)" />
        </svg>
      );
    case "openai":
      // Six-petal rosette (overlapping circles) — evokes the ChatGPT knot
      // without reproducing the trademarked mark 1:1.
      return (
        <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.3">
          <circle cx="12" cy="7.5" r="4.2" />
          <circle cx="15.9" cy="9.75" r="4.2" />
          <circle cx="15.9" cy="14.25" r="4.2" />
          <circle cx="12" cy="16.5" r="4.2" />
          <circle cx="8.1" cy="14.25" r="4.2" />
          <circle cx="8.1" cy="9.75" r="4.2" />
        </svg>
      );
    case "claude":
      return (
        <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round">
          <path d="M12 2.5v19M2.5 12h19M5.4 5.4l13.2 13.2M18.6 5.4L5.4 18.6" />
        </svg>
      );
    default:
      return null;
  }
}
