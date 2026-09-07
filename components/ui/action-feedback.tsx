"use client";

import { useReducer, useTransition } from "react";
import { Icon } from "@/components/ui/icon";
import {
  actionFeedbackReducer,
  INITIAL_ACTION_FEEDBACK,
  type ActionFeedbackState
} from "@/lib/ui/action-feedback";

const GENERIC_ERROR = "No se ha podido completar la acción en este momento. Inténtalo de nuevo en unos minutos.";

type ActionResult = { success: true } | { success: false; error: string };

/**
 * ACTIONS-OBSERVABLE-1 slice 4a — the one place every action-button in the
 * product runs its server action through, so "pending / success with an
 * acknowledgement / categorized error, never nothing" is enforced once, not
 * re-implemented per button. Wraps the pure reducer in
 * lib/ui/action-feedback.ts with the React bits (useTransition so a pending
 * mutation doesn't block the rest of the UI, same pattern every existing
 * dismiss/rewrite handler already used).
 */
export function useActionFeedback() {
  const [state, dispatch] = useReducer(actionFeedbackReducer, INITIAL_ACTION_FEEDBACK);
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<ActionResult>, opts: { successMessage: string; onSuccess?: () => void }) {
    dispatch({ type: "start" });
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.success) {
          dispatch({ type: "fail", message: result.error });
          return;
        }
        dispatch({ type: "succeed", message: opts.successMessage });
        opts.onSuccess?.();
      } catch {
        dispatch({ type: "fail", message: GENERIC_ERROR });
      }
    });
  }

  function reset() {
    dispatch({ type: "reset" });
  }

  return { state, isPending, run, reset };
}

/**
 * Renders the success/error half of the contract with `role="status"` +
 * `aria-live="polite"`, so the outcome is announced instead of only being
 * discoverable by looking at the right pixel — none of the six actions this
 * fase covers announced anything before it (docs/external-audit-2026-08.md,
 * Fase 4, P0-04). Renders nothing for "idle"/"pending" — the caller owns the
 * pending presentation (usually a `.btn-spinner` next to the button label,
 * same as before this fase), because that one already varies per action.
 */
export function ActionAnnouncement({ state }: { state: ActionFeedbackState }) {
  if (state.status === "success") {
    return (
      <p className="feedback success" role="status" aria-live="polite" style={{ margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
        <Icon name="check" size={13} />
        {state.message}
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <p className="feedback error" role="status" aria-live="polite" style={{ margin: 0 }}>
        {state.message}
      </p>
    );
  }
  return null;
}
