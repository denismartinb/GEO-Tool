"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import type { PageFix } from "@/lib/web-audit/page-fixes";

/**
 * WEB-AUDIT-ISSUES-1 fase 3b — one copyable fix, inside a page's row in the
 * Páginas tab.
 *
 * The point of the whole phase, in the founder's words: the audit told you
 * what was wrong but "no damos una solución para mejorar la puntuación de
 * cada página". Prose guidance said *what* to change; this hands over the
 * actual block to paste.
 *
 * Placeholders are called out explicitly rather than hidden. `page-fixes.ts`
 * can fill the URL, the canonical, the detected date and the @type from real
 * persisted data, but never the page's own title/description text — that is
 * simply not stored. Pretending otherwise, by inventing plausible copy, is
 * the "fake product behavior" this repo forbids, so instead the block says
 * out loud which parts are yours to write.
 */
export function PageFixBlock({ fix }: { fix: PageFix }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(fix.snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard unavailable (insecure context, older browser) — fail
      // silently: the snippet is on screen and selectable either way.
    }
  }

  return (
    <div className="wa2-fix">
      <div className="wa2-fix-head">
        <span className="wa2-fix-where">{fix.where}</span>
        <button type="button" className="btn btn-ghost btn-sm wa2-fix-copy" onClick={handleCopy}>
          <Icon name={copied ? "check" : "copy"} size={12} />
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
      <pre className="wa2-fix-code">{fix.snippet}</pre>
      {fix.placeholders.length > 0 && (
        <p className="wa2-fix-note">
          Sustituye {fix.placeholders.map((p) => `«${p}»`).join(" y ")} por tu texto antes de publicarlo.
        </p>
      )}
    </div>
  );
}
