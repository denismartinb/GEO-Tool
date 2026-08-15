"use client";

import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/icon";

export function MarketingMobileNav({
  links,
  twoLine = false,
  fromRight = false,
  brand,
  ctas
}: {
  links: Array<{ href: string; label: string }>;
  /** Two-line burger glyph (v3 landing hero) instead of the default three-line one. */
  twoLine?: boolean;
  /** Slide the drawer in from the right (matches a right-positioned burger) instead of the default left. */
  fromRight?: boolean;
  /** Rendered alongside the close button in a header row, matching the console
   * sidebar drawer's `.sb-brand`. Omit for the old close-button-only row. */
  brand?: ReactNode;
  /** Extra actions (e.g. login/signup) rendered at the bottom of the drawer. */
  ctas?: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  // Portal straight to <body>: .lp-nav-wrap is `position: sticky` with its
  // own z-index, which creates a stacking context that would otherwise trap
  // this `position: fixed` drawer behind later page sections (same reason
  // AddPromptsButton's modal is portalled).
  const closeButton = (
    <button type="button" className="lp-mobnav-close" onClick={() => setOpen(false)} aria-label="Cerrar menú">
      <Icon name="x" size={18} />
    </button>
  );

  const drawer = open
    ? createPortal(
        <>
          <div className="lp-mobnav-scrim" onClick={() => setOpen(false)} aria-hidden="true" />
          <nav className={`lp-mobnav${fromRight ? " lp-mobnav--right" : ""}`} aria-label="Menú">
            {brand ? (
              <div className="lp-mobnav-brand">
                {brand}
                {closeButton}
              </div>
            ) : (
              closeButton
            )}
            <div className="lp-mobnav-body">
              {links.map((link) => (
                <a key={link.href} href={link.href} onClick={() => setOpen(false)}>
                  {link.label}
                </a>
              ))}
            </div>
            {ctas ? <div className="lp-mobnav-ctas">{ctas}</div> : null}
          </nav>
        </>,
        document.body
      )
    : null;

  return (
    <>
      <button type="button" className="lp-burger" onClick={() => setOpen(true)} aria-label="Abrir menú">
        <Icon name={twoLine ? "menu2" : "menu"} size={twoLine ? 22 : 20} />
      </button>
      {drawer}
    </>
  );
}
