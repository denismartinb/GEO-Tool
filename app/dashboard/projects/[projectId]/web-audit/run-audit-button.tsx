"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { auditDomainCoverageAction } from "../actions";

// Hard cap on how many times this drives the server action for one campaign
// (WEB-AUDIT-CHAIN, mirrors AutoExecuteScan/SCAN-CHAIN-1). Each call audits up
// to a batch's worth of topics server-side; a very large prompt set (e.g. the
// Agency plan's 300-prompt ceiling at BATCH_TOPICS_PER_CALL/batch) needs well
// under this many windows — the cap only exists to guarantee the loop always
// terminates.
const MAX_DRIVE_ITERATIONS = 80;
const PACING_DELAY_MS = 1_200;
// Belt-and-braces client timeout per call, comfortably above the page's own
// maxDuration=60 (ADR-0003) so a normal slow batch is never cut off by this —
// it only fires if a request is silently dropped/hung (bad mobile connection)
// instead of cleanly resolving or rejecting, which would otherwise leave the
// UI stuck on "Auditando…" forever with no error and no way to retry.
const CALL_TIMEOUT_MS = 65_000;
// How many THROWN (not well-formed) failures in a row before giving up and
// showing an error — a single dropped mobile-network request should not kill
// a mostly-finished campaign (founder report: one hiccup on weak 4G ended the
// drive loop with a scary permanent-looking error while the campaign was 36
// of 49 done and perfectly resumable). See the retry logic in drive() below.
const MAX_CONSECUTIVE_FAILURES = 3;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withClientTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("client_timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/**
 * Triggers a coverage audit and lets the server-rendered "Auditoría web" page
 * pick up the (persisted) result on refresh — unlike the old ephemeral
 * domain-coverage-section.tsx, this component holds no coverage state of its
 * own beyond in-flight progress, so a page reload never loses the result.
 *
 * WEB-AUDIT-CHAIN: a project with more active prompts than one batch can
 * cover (BATCH_TOPICS_PER_CALL in domain-coverage.ts) needs several chained
 * server-action calls to complete a campaign — this loops
 * `auditDomainCoverageAction` from the founder's own authenticated session
 * (mirroring AutoExecuteScan's foreground-only driver; see ADR-0014) until the
 * campaign's `status` comes back "completed", showing real progress
 * (`covered / total temas`) along the way instead of an all-or-nothing
 * spinner.
 *
 * `autoStart`: server-provided progress for an already-running campaign for
 * the current scan (page.tsx detects it by querying generated_solutions
 * directly — real persisted state, not client memory). When present, this
 * component immediately resumes driving on mount, exactly like
 * AutoExecuteScan resumes a pending/running scan_run: navigating away and
 * back (or a full page reload, or a closed tab reopened later) must keep
 * showing real progress instead of a reset "Auditar ahora" button, because
 * the campaign genuinely is still running server-side.
 *
 * Deliberately NOT wrapped in `useTransition`/`startTransition`: that hook is
 * for marking a single state update low-priority, not for a multi-minute
 * polling loop — a founder report of the sidebar/hamburger menu becoming
 * unclickable while a long campaign ran pointed at exactly this (a pending
 * React transition can serialize with the App Router's own Link-navigation
 * transitions). Every other click-triggered driver in this codebase
 * (ScanTriggerButton, AutoExecuteScan) uses plain useState instead — this
 * follows that same established pattern.
 */
export function RunAuditButton({
  projectId,
  canAudit,
  autoStart
}: {
  projectId: string;
  canAudit: boolean;
  autoStart?: { covered: number; total: number } | null;
}) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(Boolean(autoStart));
  const [error, setError] = useState<string | null>(null);
  // Explicit success feedback. Without it, a cache hit (a re-audit of the same
  // scan returns the already-stored map) re-rendered identical content and the
  // button felt dead — "parece que no hace nada". We now confirm the click and,
  // on a cache hit, say why nothing changed.
  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ covered: number; total: number } | null>(autoStart ?? null);
  const abortedRef = useRef(false);
  const firedRef = useRef(false);

  // Stop driving if the user navigates away mid-campaign (component unmount)
  // instead of continuing to fire requests and set state on an unmounted
  // component — mirrors AutoExecuteScan's cleanup. The campaign itself is
  // safe either way (it just stays "running" server-side and resumes on the
  // next click/mount), this only stops the client-side loop.
  useEffect(() => {
    return () => {
      abortedRef.current = true;
    };
  }, []);

  async function drive() {
    setError(null);
    setNotice(null);
    setIsPending(true);
    let consecutiveFailures = 0;

    try {
      for (let i = 0; i < MAX_DRIVE_ITERATIONS; i += 1) {
        if (abortedRef.current) return;

        let result;
        try {
          result = await withClientTimeout(auditDomainCoverageAction({ projectId }), CALL_TIMEOUT_MS);
        } catch {
          // Transient failure — a dropped mobile connection, a redeploy
          // mid-request, our own client_timeout — never means the campaign
          // itself is broken; the persisted 'running' row is untouched and
          // fully resumable. Mirrors AutoExecuteScan's own resilience: don't
          // abort on the first hiccup, just retry after the pacing delay.
          // Only give up (and only THEN show the founder an error) after
          // several IN A ROW, which means something is genuinely stuck.
          if (abortedRef.current) return;
          consecutiveFailures += 1;
          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            // Founder-confirmed real scenario: this fires while the campaign
            // is genuinely fine and mid-way (e.g. 36/49) — only the CLIENT's
            // own connection is what gave up, not the audit. The old generic
            // "no se ha podido auditar" read as "everything failed", which
            // was misleading right next to the still-accurate "Auditoría en
            // curso" banner showing real, unlost progress. Say what's
            // actually true instead.
            setError(
              progress
                ? `Se ha interrumpido la conexión, pero tu progreso está guardado (${progress.covered}/${progress.total} temas). Pulsa «Auditar ahora» para continuar.`
                : "No se ha podido auditar la cobertura de tu dominio en este momento. Inténtalo de nuevo en unos minutos."
            );
            return;
          }
          await delay(PACING_DELAY_MS);
          continue;
        }

        if (abortedRef.current) return;

        // A well-formed failure response (rate limit, plan gate, a real
        // server-side error) is the server telling us definitively no —
        // unlike a thrown/network error above, retrying this blindly would
        // just waste calls, so it stops immediately.
        if (!result.success) {
          setError(result.error);
          return;
        }

        consecutiveFailures = 0;
        setProgress({ covered: result.coverage.topics.length, total: result.totalPrompts });

        if (result.status === "completed") {
          setNotice(
            result.cached
              ? "Ya tenías la auditoría más reciente de este escaneo. Vuelve a lanzar un escaneo para auditar datos nuevos."
              : "Auditoría actualizada."
          );
          router.refresh();
          return;
        }

        await delay(PACING_DELAY_MS);
      }

      // Hit the iteration cap without completing (very large prompt sets) —
      // refresh anyway so the partial progress made so far is visible; the
      // campaign stays "running" and the next click/mount resumes it.
      if (!abortedRef.current) router.refresh();
    } finally {
      if (!abortedRef.current) setIsPending(false);
    }
  }

  // Auto-resume: fires once per mount when the server says a campaign for
  // this scan is already running. Guarded by firedRef so React re-rendering
  // this component (e.g. a parent re-render) never starts a second
  // concurrent loop.
  useEffect(() => {
    if (!autoStart || firedRef.current) return;
    firedRef.current = true;
    void drive();
    // Deliberately fires once on mount only (autoStart is the server-provided
    // snapshot that decides whether to auto-resume at all; `drive` closes
    // over projectId/router, which are stable for this component's lifetime).
  }, []);

  if (!canAudit) {
    return (
      <span className="badge badge-outline">
        <Icon name="search" size={11} />
        Disponible en plan Pro
      </span>
    );
  }

  const progressLabel = progress && progress.total > progress.covered ? `Auditando… ${progress.covered}/${progress.total} temas` : "Auditando…";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      <Button type="button" onClick={drive} disabled={isPending}>
        {isPending ? <span className="btn-spinner" /> : <Icon name="search" size={14} />}
        {isPending ? progressLabel : "Auditar ahora"}
      </Button>
      {error && (
        <p className="feedback error" style={{ margin: 0, fontSize: 12 }}>
          {error}
        </p>
      )}
      {notice && !error && (
        <p style={{ margin: 0, fontSize: 12, color: "var(--ink-3)", textAlign: "right", maxWidth: 280 }}>
          <Icon name="check" size={11} /> {notice}
        </p>
      )}
    </div>
  );
}
