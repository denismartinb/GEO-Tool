"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import type { LlmsTxtResult, PublishStep } from "@/lib/web-audit/llms-txt";

/**
 * WEB-AUDIT-ISSUES-1 fase 3a — the generated `llms.txt` plus how to publish it.
 *
 * Sibling of fase 3b's `PageFixBlock` and deliberately built on the same
 * `.wa2-fix` chrome, so a copyable artifact looks the same everywhere in this
 * screen rather than each phase inventing its own.
 *
 * Two halves, and the second is not filler. Generating the file is the easy
 * part; "publica un fichero llms.txt en la raíz de tu dominio" is where a
 * marketing lead on a Shopify store stops, because it assumes they know what
 * a web root is and how to tell whether it worked. The founder asked for
 * precise publishing instructions for exactly that reason (2026-08-04), so
 * the steps end on a URL the user opens themselves — success is something
 * they SEE, not something they assume.
 *
 * Download as well as copy: this is a file, not a snippet. Copying it into a
 * text editor and saving it is where the filename gets mangled (llms.TXT,
 * llms.txt.txt), and the check is case-sensitive.
 */
export function LlmsTxtBlock({ file, steps }: { file: LlmsTxtResult; steps: PublishStep[] }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(file.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard unavailable (insecure context, older browser) — fail
      // silently: the text is on screen and selectable either way.
    }
  }

  function handleDownload() {
    const blob = new Blob([file.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "llms.txt";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="wa2-llms">
      <div className="wa2-fix">
        <div className="wa2-fix-head">
          <span className="wa2-fix-where">
            {file.sectionCount} {file.sectionCount === 1 ? "sección" : "secciones"} · {file.linkCount}{" "}
            {file.linkCount === 1 ? "página verificada" : "páginas verificadas"}
          </span>
          <span className="wa2-llms-actions">
            <button type="button" className="btn btn-ghost btn-sm wa2-fix-copy" onClick={handleCopy}>
              <Icon name={copied ? "check" : "copy"} size={12} />
              {copied ? "Copiado" : "Copiar"}
            </button>
            <button type="button" className="btn btn-ghost btn-sm wa2-fix-copy" onClick={handleDownload}>
              <Icon name="download" size={12} />
              Descargar
            </button>
          </span>
        </div>
        <pre className="wa2-fix-code">{file.content}</pre>
        <p className="wa2-fix-note">
          Las URLs y los temas salen de tu última auditoría de cobertura. Las descripciones las escribes tú:
          sustituye {file.placeholders.map((p) => `«${p}»`).join(" y ")} antes de publicarlo.
        </p>
      </div>

      <ol className="wa2-llms-steps">
        {steps.map((step, i) => (
          <li key={step.title} className="wa2-llms-step">
            <span className="wa2-llms-num" aria-hidden="true">
              {i + 1}
            </span>
            <div className="wa2-llms-step-body">
              <span className="wa2-llms-step-title">{step.title}</span>
              <p className="wa2-llms-step-text">{step.body}</p>
              {step.code && <code className="wa2-llms-code">{step.code}</code>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
