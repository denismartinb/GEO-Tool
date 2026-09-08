import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { newProjectDefaults } from "./new-project-defaults";

/**
 * PROJECT-DEFAULTS-BY-ACCOUNT-1 — regression tests for the precedence bug the
 * founder found on 2026-08-27: a brand-new account created a domain on a
 * preview and got the cheap-testing set (Cobertura, Suelo de muestreo, Claude
 * and OpenAI all off), because `previewTestingDefaults` won on any preview
 * for anyone. The fork is now the ACCOUNT, never the environment.
 *
 * These live here rather than against the server action because
 * `app/dashboard/projects/actions.ts` is `"use server"` — every export there
 * must be an async server action, so the helpers could not be exported and
 * nothing could assert on them. That is why the bug shipped.
 */
describe("newProjectDefaults", () => {
  const ORIGINAL_EMAILS = process.env.INTERNAL_TEST_ACCOUNT_EMAILS;
  const ORIGINAL_VERCEL_ENV = process.env.VERCEL_ENV;

  beforeEach(() => {
    process.env.INTERNAL_TEST_ACCOUNT_EMAILS = "founder@example.com";
  });

  afterEach(() => {
    if (ORIGINAL_EMAILS === undefined) delete process.env.INTERNAL_TEST_ACCOUNT_EMAILS;
    else process.env.INTERNAL_TEST_ACCOUNT_EMAILS = ORIGINAL_EMAILS;
    if (ORIGINAL_VERCEL_ENV === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = ORIGINAL_VERCEL_ENV;
  });

  const ALL_ON = {
    sampling_enabled: true,
    auto_coverage_audit_enabled: true,
    auto_technical_audit_enabled: true,
    engine_gemini_enabled: true,
    engine_claude_enabled: true,
    engine_openai_enabled: true
  };

  it("gives a real account every switch on, in production", () => {
    process.env.VERCEL_ENV = "production";
    expect(newProjectDefaults("customer@example.com")).toEqual(ALL_ON);
  });

  it("gives a real account every switch on ON A PREVIEW TOO — the 2026-08-27 regression", () => {
    // The exact scenario the founder hit: a fresh, non-internal account
    // creating a domain on a preview deploy. Before the fix this returned the
    // cheap-testing set and left four switches off.
    process.env.VERCEL_ENV = "preview";
    expect(newProjectDefaults("customer@example.com")).toEqual(ALL_ON);
  });

  it("gives a real account every switch on in local dev too", () => {
    process.env.VERCEL_ENV = "development";
    expect(newProjectDefaults("customer@example.com")).toEqual(ALL_ON);
  });

  it("treats an account with no email as real — never as an internal test account", () => {
    process.env.VERCEL_ENV = "preview";
    expect(newProjectDefaults(null)).toEqual(ALL_ON);
    expect(newProjectDefaults(undefined)).toEqual(ALL_ON);
  });

  it("keeps the cheap testing set for an internal test account on a preview", () => {
    process.env.VERCEL_ENV = "preview";
    expect(newProjectDefaults("founder@example.com")).toEqual({
      auto_technical_audit_enabled: true,
      auto_coverage_audit_enabled: false,
      engine_gemini_enabled: true,
      engine_claude_enabled: false,
      engine_openai_enabled: false
    });
  });

  it("never lets the cheap testing set reach production, even for an internal test account", () => {
    // Both gates, in order: internal account first, then VERCEL_ENV. In
    // production the second one hands back {} — every column falls through to
    // its schema default, exactly as before this phase.
    process.env.VERCEL_ENV = "production";
    expect(newProjectDefaults("founder@example.com")).toEqual({});
  });

  it("is case-insensitive about who counts as internal (delegates to isInternalTestAccountEmail)", () => {
    process.env.VERCEL_ENV = "preview";
    expect(newProjectDefaults("Founder@Example.com").auto_coverage_audit_enabled).toBe(false);
  });
});
