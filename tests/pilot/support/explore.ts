import { appendFileSync, mkdirSync } from "node:fs";
import type { Page, TestInfo } from "@playwright/test";
import { redact } from "./env";

/**
 * Generic interaction explorer (UX-PILOT-1c).
 *
 * The pilot used to prove only that a screen *renders*. Everything behind a
 * click — a disclosure panel, a filter tab, a tooltip — was invisible to it,
 * so "PILOT PASS" could coexist with a control that did nothing at all.
 * Writing a bespoke Playwright test per feature does not scale and only ever
 * covers what someone remembered to write.
 *
 * This module instead DISCOVERS the safe, in-page controls on whatever screen
 * it is pointed at, exercises each one, and records what happened. Three of
 * the findings it produces are things a machine can know for certain, which is
 * exactly the split this harness is built on (assertions own the certain part,
 * the agent owns judgement):
 *
 *   - `dead`      — clicked, and nothing in the DOM changed. A control that
 *                   looks interactive and isn't.
 *   - `overflow`  — the interaction pushed the page into horizontal overflow
 *                   that wasn't there before.
 *   - `error`     — the interaction produced a console error.
 *
 * ---------------------------------------------------------------------------
 * SAFETY — read before widening any selector below.
 * ---------------------------------------------------------------------------
 * The pilot account lives in the SAME Supabase project as production, and
 * scans cost real money against Gemini / OpenAI / Anthropic (UX-PILOT-1 scope
 * guard, docs/agentic-user-pilot.md). "Click everything" against that is
 * indefensible, so this explorer is allow-list-first and refuses anything it
 * cannot prove is a local, in-page state toggle:
 *
 *   1. Only elements matching `EXPLORABLE` are considered at all.
 *   2. Anything inside a <form>, any submit button, and any <a> that would
 *      navigate are skipped outright.
 *   3. Any accessible name matching `DESTRUCTIVE_TEXT` is skipped, as a
 *      belt-and-braces guard against a future component that happens to match
 *      an allowed selector.
 *
 * A skipped element is recorded (`skipped`), never silently dropped: the agent
 * reading the evidence must be able to see what the explorer chose not to
 * touch, so "not covered" never masquerades as "verified".
 */

const FINDINGS_PATH = ".pilot/findings.jsonl";
const SCREENS_DIR = ".pilot/screens";

/**
 * In-page state toggles only. Deliberately NOT `button` — that would sweep up
 * every submit/destructive action on the page and rely purely on the deny-list
 * to save us. Each entry here is a pattern whose whole purpose is local UI
 * state.
 */
const EXPLORABLE = [
  "[aria-expanded]",
  ".info-tip",
  ".cit2-tab",
  ".cit2-rowmain",
  ".cit2-opp-row",
  ".cit2-btn-mini",
  ".pr2-trow",
  ".pr2-prow",
  ".drawer-tab",
  "[data-pilot-explore]"
].join(", ");

/**
 * Never interact with anything whose accessible name matches. Matched
 * case-insensitively against the element's trimmed text + aria-label.
 *
 * STEMS, anchored only at the START of a word — deliberately not `\b…\b`.
 * The first version wrapped each alternative in both boundaries and so failed
 * to match its own target: `\belimina\b` does not match "Eliminar", because
 * the trailing `r` is a word character. The fixture's decoy "Eliminar
 * proyecto" button was clicked instead of refused, which against the real
 * Supabase project is exactly the accident this list exists to prevent
 * (caught by the fixture, 2026-08-02). Over-matching is the correct failure
 * direction here: refusing a harmless control costs coverage, clicking a
 * destructive one costs data.
 */
const DESTRUCTIVE_TEXT =
  /\b(elimin|borrar|borra|delete|remov|desactiv|cancel|lanz|escane|scan|guard|sav(e|ar)|crear|creat|añad|add|nuev|new|envi|submit|pag(ar|o)|pay|suscrib|subscri|upgrade|downgrade|invit|desconect|cerrar sesi|sign ?out|log ?out|restablec|reset|reintent|retry)/i;

/** Cap so a screen with hundreds of rows cannot blow the 60s test budget. */
const MAX_INTERACTIONS_PER_SCREEN = 8;

export interface InteractionFinding {
  screen: string;
  viewport: string;
  /** Best-effort human label: accessible name, else selector + index. */
  control: string;
  outcome: "changed" | "dead" | "skipped";
  skippedReason?: string;
  /** Interaction introduced horizontal overflow that wasn't there before. */
  introducedOverflow: boolean;
  /** Console errors that appeared during this specific interaction. */
  consoleErrors: string[];
  screenshot?: string;
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

function record(finding: InteractionFinding): void {
  mkdirSync(".pilot", { recursive: true });
  appendFileSync(FINDINGS_PATH, `${JSON.stringify({ kind: "interaction", ...finding })}\n`);
}

/**
 * A cheap fingerprint of what the user can currently see. Compared before and
 * after an interaction to decide whether the control did anything at all.
 * Deliberately coarse — it answers "did the visible UI change?", not "what
 * exactly changed", which is the agent's job to judge from the screenshot.
 */
async function domSignature(page: Page): Promise<string> {
  return page.evaluate(() => {
    const visible = Array.from(document.querySelectorAll<HTMLElement>("body *")).filter((el) => {
      const style = window.getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden" && el.offsetParent !== null;
    });
    return `${visible.length}:${document.body.innerText.length}:${document.documentElement.scrollHeight}`;
  });
}

async function hasHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
}

/** Why this element must not be touched, or `null` when it is safe. */
async function refuseReason(el: import("@playwright/test").Locator): Promise<string | null> {
  const info = await el.evaluate((node: Element) => {
    const anchor = node.closest("a");
    const button = node as HTMLButtonElement;
    return {
      inForm: Boolean(node.closest("form")),
      isSubmit: node.tagName === "BUTTON" && (button.type === "submit" || !button.type),
      href: anchor?.getAttribute("href") ?? null,
      disabled: node.hasAttribute("disabled") || node.getAttribute("aria-disabled") === "true",
      name: `${node.textContent ?? ""} ${node.getAttribute("aria-label") ?? ""}`.trim()
    };
  });

  if (info.disabled) return "disabled";
  if (info.inForm) return "inside a form — could write to Supabase";
  if (info.isSubmit) return "submit button — could write to Supabase";
  // A same-page anchor (#hash) is fine; anything else navigates away and would
  // take the explorer off the screen it is supposed to be exercising.
  if (info.href && !info.href.startsWith("#")) return `navigates away (${info.href})`;
  if (DESTRUCTIVE_TEXT.test(info.name)) return `destructive/write-looking label: "${info.name.slice(0, 40)}"`;
  return null;
}

/**
 * Exercises every safe in-page control on the current screen and records what
 * each one did. Returns the findings so a journey can assert on them.
 *
 * Does NOT throw on a dead control: the pilot reports, the agent judges, and a
 * dead control on one screen should not abort the sweep of the rest. Journeys
 * that care can assert on the returned findings.
 */
export async function exploreInteractions(
  page: Page,
  testInfo: TestInfo,
  screen: string
): Promise<InteractionFinding[]> {
  const findings: InteractionFinding[] = [];
  const consoleErrors: string[] = [];
  const onConsole = (message: { type: () => string; text: () => string }) => {
    if (message.type() === "error") consoleErrors.push(redact(message.text()));
  };
  page.on("console", onConsole);

  try {
    const candidates = page.locator(EXPLORABLE);
    const total = Math.min(await candidates.count(), MAX_INTERACTIONS_PER_SCREEN);

    for (let i = 0; i < total; i++) {
      const el = candidates.nth(i);
      if (!(await el.isVisible().catch(() => false))) continue;

      const control =
        (await el.getAttribute("aria-label")) ||
        ((await el.textContent()) ?? "").trim().slice(0, 60) ||
        `${screen} control #${i + 1}`;

      const refusal = await refuseReason(el).catch(() => "could not inspect element");
      if (refusal) {
        const finding: InteractionFinding = {
          screen,
          viewport: testInfo.project.name,
          control,
          outcome: "skipped",
          skippedReason: refusal,
          introducedOverflow: false,
          consoleErrors: []
        };
        findings.push(finding);
        record(finding);
        continue;
      }

      const overflowBefore = await hasHorizontalOverflow(page);
      const before = await domSignature(page);
      consoleErrors.length = 0;

      await el.scrollIntoViewIfNeeded().catch(() => undefined);
      // Hover first so pure-CSS reveals (`.info-tip`) are exercised too, then
      // click for the JS-driven ones. Harmless for controls that only respond
      // to one of the two.
      await el.hover({ timeout: 5_000 }).catch(() => undefined);
      await el.click({ timeout: 5_000 }).catch(() => undefined);
      await page.waitForTimeout(350);

      const after = await domSignature(page);
      const changed = before !== after;
      const introducedOverflow = !overflowBefore && (await hasHorizontalOverflow(page));

      let screenshot: string | undefined;
      if (changed || introducedOverflow) {
        screenshot = `${SCREENS_DIR}/${slug(testInfo.project.name)}--${slug(screen)}--x${i + 1}-${slug(control)}.png`;
        mkdirSync(SCREENS_DIR, { recursive: true });
        await page.screenshot({ path: screenshot, fullPage: true });
        await testInfo.attach(`${screen} → ${control} (${testInfo.project.name})`, {
          path: screenshot,
          contentType: "image/png"
        });
      }

      const finding: InteractionFinding = {
        screen,
        viewport: testInfo.project.name,
        control,
        outcome: changed ? "changed" : "dead",
        introducedOverflow,
        consoleErrors: [...consoleErrors],
        ...(screenshot ? { screenshot } : {})
      };
      findings.push(finding);
      record(finding);

      // Restore the default state where the control was a toggle, so the next
      // candidate is exercised from a clean baseline rather than compounding.
      if (changed) {
        await el.click({ timeout: 5_000 }).catch(() => undefined);
        await page.waitForTimeout(150);
      }
    }
  } finally {
    page.off("console", onConsole);
  }

  return findings;
}

/**
 * The subset of findings worth a human's attention. Kept separate from the
 * sweep itself so a journey decides whether to fail on them — the explorer's
 * job is to observe, not to police.
 */
export function interactionProblems(findings: InteractionFinding[]): InteractionFinding[] {
  return findings.filter(
    (f) =>
      (f.outcome === "dead" && !f.skippedReason) ||
      f.introducedOverflow ||
      f.consoleErrors.length > 0
  );
}
