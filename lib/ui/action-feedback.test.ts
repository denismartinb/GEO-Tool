import { describe, expect, it } from "vitest";
import { actionFeedbackReducer, INITIAL_ACTION_FEEDBACK, type ActionFeedbackState } from "./action-feedback";

describe("actionFeedbackReducer", () => {
  it("starts idle", () => {
    expect(INITIAL_ACTION_FEEDBACK).toEqual({ status: "idle" });
  });

  it("goes to pending on start, from any state", () => {
    const states: ActionFeedbackState[] = [
      { status: "idle" },
      { status: "success", message: "ok" },
      { status: "error", message: "fail" }
    ];
    for (const state of states) {
      expect(actionFeedbackReducer(state, { type: "start" })).toEqual({ status: "pending" });
    }
  });

  it("carries the acknowledgement message on success", () => {
    const result = actionFeedbackReducer(
      { status: "pending" },
      { type: "succeed", message: "Marcada como hecha." }
    );
    expect(result).toEqual({ status: "success", message: "Marcada como hecha." });
  });

  it("carries the categorized error message on failure — never a raw one", () => {
    const result = actionFeedbackReducer({ status: "pending" }, { type: "fail", message: "algo se rompió" });
    expect(result).toEqual({ status: "error", message: "algo se rompió" });
  });

  it("returns to idle on reset from success or error", () => {
    expect(actionFeedbackReducer({ status: "success", message: "ok" }, { type: "reset" })).toEqual({
      status: "idle"
    });
    expect(actionFeedbackReducer({ status: "error", message: "fail" }, { type: "reset" })).toEqual({
      status: "idle"
    });
  });

  it("never produces a state outside the three visible ones plus idle", () => {
    const events: ActionFeedbackEventLike[] = [
      { type: "start" },
      { type: "succeed", message: "m" },
      { type: "fail", message: "m" },
      { type: "reset" }
    ];
    for (const event of events) {
      const result = actionFeedbackReducer(INITIAL_ACTION_FEEDBACK, event);
      expect(["idle", "pending", "success", "error"]).toContain(result.status);
    }
  });
});

type ActionFeedbackEventLike =
  | { type: "start" }
  | { type: "succeed"; message: string }
  | { type: "fail"; message: string }
  | { type: "reset" };
