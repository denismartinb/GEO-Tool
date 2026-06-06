import type { ReactNode } from "react";

type IconProps = {
  name: string;
  size?: number;
  className?: string;
};

export function Icon({ name, size = 16, className = "" }: IconProps) {
  const props = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: `ico ${className}`.trim(),
    "aria-hidden": true
  };

  const icons: Record<string, ReactNode> = {
    resonance: (
      <>
        <circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" />
        <path d="M7.6 8.4a6 6 0 0 0 0 7.2" />
        <path d="M16.4 8.4a6 6 0 0 1 0 7.2" />
        <path d="M4.9 5.8a9.6 9.6 0 0 0 0 12.4" opacity=".5" />
        <path d="M19.1 5.8a9.6 9.6 0 0 1 0 12.4" opacity=".5" />
      </>
    ),
    overview: (
      <>
        <rect x="3" y="3" width="7.5" height="9" rx="1.5" />
        <rect x="13.5" y="3" width="7.5" height="6" rx="1.5" />
        <rect x="3" y="15" width="7.5" height="6" rx="1.5" />
        <rect x="13.5" y="12" width="7.5" height="9" rx="1.5" />
      </>
    ),
    prompts: <path d="M4 5h16M4 12h11M4 19h7" />,
    competitors: (
      <>
        <circle cx="8" cy="8" r="3" />
        <circle cx="17" cy="14" r="3" />
        <path d="M2.5 20a5.5 5.5 0 0 1 9.5-3.8M14 6.2A5.5 5.5 0 0 1 21.5 11" />
      </>
    ),
    runs: <path d="M5 4.5v15l13-7.5z" />,
    recs: (
      <>
        <path d="M12 3a6 6 0 0 0-4 10.5c.6.6 1 1.3 1 2.1V17h6v-1.4c0-.8.4-1.5 1-2.1A6 6 0 0 0 12 3Z" />
        <path d="M9.5 20.5h5M10 23h4" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 0 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 2.6 14H2.5a2 2 0 0 1 0-4h.1A1.6 1.6 0 0 0 4 7.6l-.3.3a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 9 4.6h.1A2 2 0 0 1 13 4.6V4.7A1.6 1.6 0 0 0 17 7" />
      </>
    ),
    play: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M10 8.5v7l5-3.5z" />
      </>
    ),
    refresh: <path d="M21 12a9 9 0 1 1-2.6-6.4M21 4v4h-4" />,
    bell: (
      <>
        <path d="M18 9a6 6 0 0 0-12 0c0 6-2.5 7-2.5 7h17S18 15 18 9Z" />
        <path d="M10 20a2 2 0 0 0 4 0" />
      </>
    ),
    globe: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18" />
      </>
    ),
    lang: <path d="M4 5h9M8.5 5c0 5-3 9-5.5 11M5 9c1.5 3.5 4 5 7 6.5M14 21l4-9 4 9M15.5 18h5" />,
    search: (
      <>
        <circle cx="11" cy="11" r="6.5" />
        <path d="m20 20-3.6-3.6" />
      </>
    ),
    arrRight: <path d="M5 12h14M13 6l6 6-6 6" />,
    arrUp: <path d="M12 19V5M5 12l7-7 7 7" />,
    arrDown: <path d="M12 5v14M5 12l7 7 7-7" />,
    chevronLeft: <path d="m15 6-6 6 6 6" />,
    chevronDown: <path d="m6 9 6 6 6-6" />,
    sparkles: (
      <>
        <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z" />
        <path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8z" />
        <path d="M5 18l.5 1.5L7 20l-1.5.5L5 22l-.5-1.5L3 20l1.5-.5z" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v1M12 11v5" />
      </>
    ),
    trendUp: <path d="M3 17l4-5 4 3 4-6 4 4" />,
    bolt: <path d="M13 2L4.09 12.96A1 1 0 0 0 5 14.5h6.5L10 22l9.94-10.96A1 1 0 0 0 19 9.5H12.5z" />,
    link: (
      <>
        <path d="M10 13a5 5 0 0 0 7.5.7l2-2a5 5 0 0 0-7-7l-1 1" />
        <path d="M14 11a5 5 0 0 0-7.5-.7l-2 2a5 5 0 0 0 7 7l1-1" />
      </>
    ),
    check: <path d="M20 6L9 17l-5-5" />
  };

  return <svg {...props}>{icons[name] ?? icons.overview}</svg>;
}
