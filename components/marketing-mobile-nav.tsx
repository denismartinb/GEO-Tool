"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/icon";

export function MarketingMobileNav({ links }: { links: Array<{ href: string; label: string }> }) {
  const [open, setOpen] = useState(false);

  // Portal straight to <body>: .lp-nav-wrap is `position: sticky` with its
  // own z-index, which creates a stacking context that would otherwise trap
  // this `position: fixed` drawer behind later page sections (same reason
  // AddPromptsButton's modal is portalled).
  const drawer = open
    ? createPortal(
        <>
          <div className="lp-mobnav-scrim" onClick={() => setOpen(false)} aria-hidden="true" />
          <nav className="lp-mobnav" aria-label="Menú">
            <button type="button" className="lp-mobnav-close" onClick={() => setOpen(false)} aria-label="Cerrar menú">
              <Icon name="x" size={18} />
            </button>
            {links.map((link) => (
              <a key={link.href} href={link.href} onClick={() => setOpen(false)}>
                {link.label}
              </a>
            ))}
          </nav>
        </>,
        document.body
      )
    : null;

  return (
    <>
      <button type="button" className="lp-burger" onClick={() => setOpen(true)} aria-label="Abrir menú">
        <Icon name="menu" size={20} />
      </button>
      {drawer}
    </>
  );
}
