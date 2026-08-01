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
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
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
    chevLeft: <path d="m15 6-6 6 6 6" />,
    chevDown: <path d="m6 9 6 6 6-6" />,
    plus: <path d="M12 5v14M5 12h14" />,
    alertCircle: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v5M12 16.5h.01" />
      </>
    ),
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
    trendDown: <path d="M3 7l4 5 4-3 4 6 4-4" />,
    flag: (
      <>
        <path d="M6 21V3.5" />
        <path d="M6 4.5h11.5l-2.4 3.9 2.4 3.9H6z" />
      </>
    ),
    hourglass: (
      <>
        <path d="M7.5 3h9M7.5 21h9" />
        <path d="M9 3v3.2c0 1.9 3 3.4 3 5.3 0-1.9 3-3.4 3-5.3V3" />
        <path d="M9 21v-3.2c0-1.9 3-3.4 3-5.3 0 1.9 3 3.4 3 5.3V21" />
      </>
    ),
    robot: (
      <>
        <rect x="3.5" y="8" width="17" height="11.5" rx="3.5" />
        <path d="M12 8V4.8" />
        <circle cx="12" cy="3.4" r="1.4" />
        <path d="M8.8 12.8v1.4M15.2 12.8v1.4" />
        <path d="M9.8 16.8h4.4" />
      </>
    ),
    bolt: <path d="M13 2L4.09 12.96A1 1 0 0 0 5 14.5h6.5L10 22l9.94-10.96A1 1 0 0 0 19 9.5H12.5z" />,
    link: (
      <>
        <path d="M10 13a5 5 0 0 0 7.5.7l2-2a5 5 0 0 0-7-7l-1 1" />
        <path d="M14 11a5 5 0 0 0-7.5-.7l-2 2a5 5 0 0 0 7 7l1-1" />
      </>
    ),
    check: <path d="M20 6L9 17l-5-5" />,
    copy: (
      <>
        <rect x="9" y="9" width="11" height="11" rx="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </>
    ),
    lock: <path d="M18 11H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM15 11V7a3 3 0 0 0-6 0v4" />,
    quote: (
      <>
        <path d="M9 7c-2.5 0-4 2-4 4.5S6.5 16 9 16M9 7v9M19 7c-2.5 0-4 2-4 4.5S16.5 16 19 16M19 7v9" />
      </>
    ),
    layers: (
      <>
        <path d="m12 3 9 5-9 5-9-5z" />
        <path d="m3 13 9 5 9-5" />
      </>
    ),
    cite: (
      <>
        <circle cx="6" cy="12" r="2.5" />
        <circle cx="18" cy="6" r="2.5" />
        <circle cx="18" cy="18" r="2.5" />
        <path d="M8.2 11 15.8 7M8.2 13l7.6 4" />
      </>
    ),
    trash: (
      <>
        <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6h14z" />
        <path d="M10 11v6M14 11v6" />
      </>
    ),
    menu: <path d="M3 6h18M3 12h18M3 18h18" />,
    menu2: <path d="M4 8h16M4 16h16" />,
    x: <path d="M18 6 6 18M6 6l12 12" />,
    card: (
      <>
        <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
        <path d="M2.5 9.5h19M6 15h3" />
      </>
    ),
    target: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <circle cx="12" cy="12" r="4.5" />
        <circle cx="12" cy="12" r=".6" fill="currentColor" stroke="none" />
      </>
    ),
    chevRight: <path d="m9 6 6 6-6 6" />,
    spark: <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />,
    grid: (
      <>
        <rect x="3" y="3" width="8" height="8" rx="1.5" />
        <rect x="13" y="3" width="8" height="8" rx="1.5" />
        <rect x="3" y="13" width="8" height="8" rx="1.5" />
        <rect x="13" y="13" width="8" height="8" rx="1.5" />
      </>
    ),
    fileText: (
      <>
        <path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
        <path d="M14 3v4h4" />
        <path d="M8.5 12h7M8.5 15.5h7" />
      </>
    ),
    edit: (
      <>
        <path d="M4 20h4L19.5 8.5a2 2 0 0 0 0-2.8L18.3 4.5a2 2 0 0 0-2.8 0L4 16v4Z" />
        <path d="M14.5 6.5 17.5 9.5" />
      </>
    ),
    mail: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m4 7 8 6 8-6" />
      </>
    ),
    download: (
      <>
        <path d="M12 4v11" />
        <path d="m7.5 11.5 4.5 4.5 4.5-4.5" />
        <path d="M5 20h14" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="3.6" />
        <path d="M5 20a7 7 0 0 1 14 0" />
      </>
    ),
    building: (
      <>
        <rect x="5" y="3" width="14" height="18" rx="1.5" />
        <path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="8" r="3.2" />
        <path d="M3 20a6 6 0 0 1 12 0" />
        <path d="M16 5.2a3.2 3.2 0 0 1 0 6M18 14.5a6 6 0 0 1 3 5.5" />
      </>
    ),
    shield: (
      <>
        <path d="M12 3 5 5.5v5c0 4.3 2.9 7.5 7 9 4.1-1.5 7-4.7 7-9v-5z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    eye: (
      <>
        <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
        <circle cx="12" cy="12" r="2.8" />
      </>
    ),
    image: (
      <>
        <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
        <circle cx="8.5" cy="10" r="1.8" />
        <path d="m4 18 5-4.5 4 3.5 3-2.5 5 4" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3.5 2" />
      </>
    ),
    crown: (
      <>
        <path d="M3.5 8.5 7 12l5-7 5 7 3.5-3.5V17a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1V8.5Z" />
        <path d="M6 20.5h12" />
      </>
    ),
    sentimentPos: (
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="8.7" cy="10" r="1" fill="currentColor" stroke="none" />
        <circle cx="15.3" cy="10" r="1" fill="currentColor" stroke="none" />
        <path d="M8 14.2c1 1.5 2.4 2.3 4 2.3s3-.8 4-2.3" />
      </>
    ),
    sentimentNeutral: (
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="8.7" cy="10" r="1" fill="currentColor" stroke="none" />
        <circle cx="15.3" cy="10" r="1" fill="currentColor" stroke="none" />
        <path d="M8.3 15.3h7.4" />
      </>
    ),
    sentimentNeg: (
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="8.7" cy="10" r="1" fill="currentColor" stroke="none" />
        <circle cx="15.3" cy="10" r="1" fill="currentColor" stroke="none" />
        <path d="M8 16.3c1-1.5 2.4-2.3 4-2.3s3 .8 4 2.3" />
      </>
    ),
    sentimentMixed: (
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="8.7" cy="10" r="1" fill="currentColor" stroke="none" />
        <circle cx="15.3" cy="10" r="1" fill="currentColor" stroke="none" />
        <path d="M8 14.5c.8-1 1.7-1 2.5 0s1.7 1 2.5 0 1.7-1 2.5 0" />
      </>
    )
  };

  return <svg {...props}>{icons[name] ?? icons.overview}</svg>;
}
