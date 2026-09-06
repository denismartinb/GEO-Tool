/**
 * ACTIONS-OBSERVABLE-1 slice 4a (docs/external-audit-2026-08.md, Fase 4,
 * P0-04) — the shared "contract of action" every interactive action in the
 * product terminates in: pending with progress, success with an
 * acknowledgement, or a categorized error. Never nothing.
 *
 * Pure reducer, deliberately separated from the React hook that wraps it
 * (components/ui/action-feedback.tsx) — same discipline as
 * lib/onboarding/tour-steps.ts vs. the component that drives it. This is
 * what stays testable without a DOM or a hook-testing library, since none is
 * installed in this repo (react-dom/server can only render, never dispatch).
 */

export type ActionFeedbackState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

export type ActionFeedbackEvent =
  | { type: "start" }
  | { type: "succeed"; message: string }
  | { type: "fail"; message: string }
  | { type: "reset" };

export const INITIAL_ACTION_FEEDBACK: ActionFeedbackState = { status: "idle" };

export function actionFeedbackReducer(
  _state: ActionFeedbackState,
  event: ActionFeedbackEvent
): ActionFeedbackState {
  switch (event.type) {
    case "start":
      return { status: "pending" };
    case "succeed":
      return { status: "success", message: event.message };
    case "fail":
      return { status: "error", message: event.message };
    case "reset":
      return { status: "idle" };
  }
}
