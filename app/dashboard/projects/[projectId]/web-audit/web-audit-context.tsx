"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
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

type Progress = { covered: number; total: number } | null;

interface WebAuditRunnerState {
  isPending: boolean;
  error: string | null;
  notice: string | null;
  progress: Progress;
  drive: () => void;
}

const WebAuditRunnerContext = createContext<WebAuditRunnerState | null>(null);

/**
 * Shared driver for the coverage-audit campaign, scoped to one web-audit
 * page render. The trigger button appears in two places (sticky header, and
 * the empty-state card) — before this Provider, each was its own component
 * instance with independent useState, so clicking one left the other frozen
 * on "Auditar ahora" while a campaign was visibly running (founder report:
 * top button didn't show loading when the card button was clicked). Lifting
 * the drive loop here means every consumer reads/drives the same state.
 */
export function WebAuditProvider({
  projectId,
  autoStart,
  children
}: {
  projectId: string;
  autoStart?: Progress;
  children: ReactNode;
}) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(Boolean(autoStart));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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
          if (abortedRef.current) return;
          consecutiveFailures += 1;
          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
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

      if (!abortedRef.current) router.refresh();
    } finally {
      if (!abortedRef.current) setIsPending(false);
    }
  }

  useEffect(() => {
    if (!autoStart || firedRef.current) return;
    firedRef.current = true;
    void drive();
    // Deliberately fires once on mount only (autoStart is the server-provided
    // snapshot that decides whether to auto-resume at all; `drive` closes
    // over projectId/router, which are stable for this component's lifetime).
  }, []);

  return (
    <WebAuditRunnerContext.Provider value={{ isPending, error, notice, progress, drive }}>
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
