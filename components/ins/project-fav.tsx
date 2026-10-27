"use client";

import { FaviconImg } from "@/components/ui/favicon-img";

const PALETTE = ["#2563eb", "#0e9f6e", "#e46b2e", "#0369a1", "#7c4dff", "#be185d", "#0f766e"];

function colorFor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** Favicon del dominio con monograma de color si el servicio no lo conoce (`.fav` del prototipo). */
export function ProjectFav({ domain, name, size = 22 }: { domain: string; name: string; size?: number }) {
  const initial = name.slice(0, 1).toUpperCase() || "?";
  return (
    <span
      className="fav w ins-fav"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <FaviconImg
        key={domain}
        domain={domain}
        cssSize={size}
        fallback={
          <span className="ins-fav-lt" style={{ background: colorFor(name) }}>
            {initial}
          </span>
        }
      />
    </span>
  );
}
