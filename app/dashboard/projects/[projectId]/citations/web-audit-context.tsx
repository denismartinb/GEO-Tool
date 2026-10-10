"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { auditDomainCoverageAction, runTechnicalAuditAction } from "../actions";

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
// Client-side guard for the piggybacked technical-audit call below —
// comfortably above its own TECH_AUDIT_TOTAL_BUDGET_MS (25s server-side), for
// the same "never hang forever on a dropped request" reason as CALL_TIMEOUT_MS.
const TECH_AUDIT_CALL_TIMEOUT_MS = 30_000;
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

type Progress = { covered: number; total: number } | null;

interface WebAuditRunnerState {
  isPending: boolean;
  error: string | null;
  progress: Progress;
  drive: () => void;
}

const WebAuditRunnerContext = createContext<WebAuditRunnerState | null>(null);

/**
 * Drives an unfinished coverage campaign to completion when the page mounts.
 *
 * **It has no consumers, and that is not an oversight.** This began as shared
 * state for the two "Auditar ahora" buttons (each had its own useState, so
 * clicking one left the other frozen mid-campaign). Both buttons are gone —
 * AUDIT-NO-BUTTON-1 — and so is the status pill that briefly replaced them,
 * so nothing reads `isPending` / `progress` / `error` today.
 *
 * What survives is the effect at the bottom: a campaign parked mid-flight
 * finishes when someone opens the page, instead of waiting for the queue's
 * next turn. It costs no extra Gemini (it is the same work the backend would
 * do) and it is what let the screen self-heal on 2026-08-04 while the queue
 * was draining slowly.
 *
 * So: **do not delete this because it looks unused.** The in-flight state is
 * genuinely dead weight and could be trimmed; the mount effect is load-bearing
 * and invisible on purpose — the sticky header renders its own "Auditando"
 * pill from server data while it runs.
 */
export function WebAuditProvider({
  projectId,
  autoStart,
  canAudit: canAuditCoverage,
  children
}: {
  projectId: string;
  autoStart?: Progress;
  /**
   * Named `canAudit` at the call site historically, but this has only ever
   * meant "can drive the coverage campaign" — the coverage half stays
   * Pro-only (WEB-AUDIT-TECH-ALL-PLANS-1, 2026-08-05); the technical half is
   * not gated at all and this component never drove it directly anyway (it
   * only piggybacks a technical re-check onto a coverage batch below).
   * Destructured under its real name so nothing inside this file has to
   * remember the distinction.
   */
  canAudit: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  // Founder-reported stuck screen: a campaign started while the account was
  // Pro, then the plan lapsed (e.g. downgraded via the new Stripe billing
  // flow) before it finished. Auto-resuming would call a server action that
  // immediately fails the Pro gate — a single silent failure nothing renders
  // (nothing consumes this context any more; see the header). Never start a
  // doomed call;
  // page.tsx now shows an explicit "plan changed mid-campaign" message using
  // the same server-computed `autoStart` snapshot instead.
  const [isPending, setIsPending] = useState(canAuditCoverage && Boolean(autoStart));
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress>(autoStart ?? null);
  const abortedRef = useRef(false);
  const firedRef = useRef(false);

  useEffect(() => {
    return () => {
      abortedRef.current = true;
    };
  }, []);

  async function drive() {
    setError(null);
    setIsPending(true);
    let consecutiveFailures = 0;

    try {
      for (let i = 0; i < MAX_DRIVE_ITERATIONS; i += 1) {
        if (abortedRef.current) return;

        let result;
        try {
          result = await withClientTimeout(auditDomainCoverageAction({ projectId }), CALL_TIMEOUT_MS);
        } catch {
          if (abortedRef.current) return;
          consecutiveFailures += 1;
          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            setError(
              progress
                ? `Se ha interrumpido la conexión, pero tu progreso está guardado (${progress.covered}/${progress.total} temas). La auditoría continuará sola.`
                : "No se ha podido auditar la cobertura de tu dominio en este momento. Inténtalo de nuevo en unos minutos."
            );
            return;
          }
          await delay(PACING_DELAY_MS);
          continue;
        }

        if (abortedRef.current) return;

        if (!result.success) {
          setError(result.error);
          return;
        }

        consecutiveFailures = 0;
        setProgress({ covered: result.coverage.topics.length, total: result.totalPrompts });

        if (result.status === "completed") {
          // No "done" notice: the `router.refresh()` below re-renders the
          // button with `upToDate` true, and its "Auditoría actualizada" pill
          // IS the confirmation (founder review 2026-08-04 — a toast saying
          // the same thing next to the pill was just noise). `result.cached`
          // stops being interesting for the same reason: "nothing changed
          // because you were already current" is now visible BEFORE the
          // click, as a disabled button.
          // WEB-AUDIT-R2 (founder-approved 2026-07-12): "Auditar ahora" now
          // also refreshes technical health, in the same click — coverage and
          // technical share the same "auditoría web" mental model going
          // forward, and each already carries its own independent 5/day rate
          // limit (no new shared budget introduced). Fire-and-forget: errors
          // and a spent rate limit are swallowed silently here, since this is
          // a piggybacked call the user didn't explicitly ask for — it must
          // never turn a successful coverage audit into something that reads
          // as broken. The manual "Auditar salud técnica" button still
          // surfaces its own errors when clicked directly. Its own 24h cache
          // (technical-audit.ts) makes this a cheap no-op when the snapshot
          // for this scan is already fresh.
          try {
            await withClientTimeout(runTechnicalAuditAction({ projectId }), TECH_AUDIT_CALL_TIMEOUT_MS);
          } catch {
            // swallowed — see comment above
          }
          if (abortedRef.current) return;
          router.refresh();
          return;
        }

        await delay(PACING_DELAY_MS);
      }

      if (!abortedRef.current) router.refresh();
    } finally {
      if (!abortedRef.current) setIsPending(false);
    }
  }

  useEffect(() => {
    if (!canAuditCoverage || !autoStart || firedRef.current) return;
    firedRef.current = true;
    void drive();
    // Deliberately fires once on mount only (autoStart is the server-provided
    // snapshot that decides whether to auto-resume at all; `drive` closes
    // over projectId/router, which are stable for this component's lifetime).
  }, []);

  return (
    <WebAuditRunnerContext.Provider value={{ isPending, error, progress, drive }}>
      {children}
    </WebAuditRunnerContext.Provider>
  );
}

export function useWebAuditRunner(): WebAuditRunnerState {
  const ctx = useContext(WebAuditRunnerContext);
  if (!ctx) {
    throw new Error("useWebAuditRunner must be used within a WebAuditProvider");
  }
  return ctx;
}
