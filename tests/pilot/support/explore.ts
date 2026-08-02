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

/**
 * Interaction findings live in their OWN file, not in `findings.jsonl`.
 * `scripts/pilot.mjs` builds the per-screen verdict table by grouping
 * `findings.jsonl` on `finding.label`; interaction records have no `label`,
 * so writing them there rendered a phantom `undefined` row in the PR comment
 * (first real run, 2026-08-02). Separate files also keep the two concerns
 * legible: one is "did the screen load", the other is "what did its controls
 * do".
 */
const INTERACTIONS_PATH = ".pilot/interactions.jsonl";
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

/**
 * Budgets. The first real run blew the 60s per-test timeout on the citations
 * screen at 375px — 32 list rows plus tabs plus tooltips, each with a
 * full-page screenshot of a very tall mobile page. Both limits below exist so
 * a long screen degrades to "fewer controls exercised" (visible in the
 * evidence, since every skipped control is still recorded) rather than to a
 * failed run that verifies nothing at all.
 */
/** Overridable so `pnpm pilot:selfcheck` can raise it and still reach the
 * fixture's safety decoys, which deliberately sit past the production cap. */
const MAX_INTERACTIONS_PER_SCREEN = Number(process.env.PILOT_MAX_INTERACTIONS ?? 4);
/** Hard stop well inside Playwright's 60s per-test timeout. */
const SWEEP_BUDGET_MS = 25_000;

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
  appendFileSync(INTERACTIONS_PATH, `${JSON.stringify({ kind: "interaction", ...finding })}\n`);
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

    // Class-attribute fingerprint. Load-bearing, not belt-and-braces: the
    // mobile nav drawer opens by toggling a class that slides it in with a
    // `transform`. Element counts, text length and scroll height are all
    // identical before and after, so the first version of this signature
    // reported the hamburger as a DEAD control on every screen — and then,
    // believing it dead, never clicked it closed, leaving a full-screen
    // scrim over the page that swallowed every subsequent click and marked
    // those dead too. One blind spot, 21 false findings (first clean run,
    // 2026-08-02). Any class toggle now registers as a change.
    let classSig = 0;
    for (const el of Array.from(document.querySelectorAll("[class]"))) {
      const value = el.getAttribute("class") ?? "";
      for (let i = 0; i < value.length; i++) classSig = (classSig * 31 + value.charCodeAt(i)) >>> 0;
    }

    // Same reasoning for disclosure state, which is often the only thing that
    // changes when a control expands something already in the DOM.
    const expanded = Array.from(document.querySelectorAll("[aria-expanded]"))
      .map((el) => el.getAttribute("aria-expanded"))
      .join("");

    return [
      visible.length,
      document.body.innerText.length,
      document.documentElement.scrollHeight,
      classSig,
      expanded
    ].join(":");
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

  // The text check only applies to something that reads like an ACTION LABEL.
  // A real destructive control is labelled "Eliminar", not with a paragraph —
  // and matching long prose produced three pure false refusals on the first
  // clean run (2026-08-02): a prompt whose own text ends "seguro de borrar",
  // a recommendation card titled "Añadir bloque de…", and the "Citas totales"
  // tooltip, refused for containing "escaneados". Each cost real coverage.
  // Above this length the element is content, not a command, and the
  // structural guards above — which are the actual safety net — still apply.
  const ACTION_LABEL_MAX = 60;
  const looksLikeActionLabel = info.name.length > 0 && info.name.length <= ACTION_LABEL_MAX;
  if (looksLikeActionLabel && DESTRUCTIVE_TEXT.test(info.name)) {
    return `destructive/write-looking label: "${info.name.slice(0, 40)}"`;
  }
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

  const startedAt = Date.now();

  try {
    const candidates = page.locator(EXPLORABLE);
    const total = Math.min(await candidates.count(), MAX_INTERACTIONS_PER_SCREEN);

    for (let i = 0; i < total; i++) {
      if (Date.now() - startedAt > SWEEP_BUDGET_MS) break;
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
        // Viewport-sized, NOT fullPage: the control was scrolled into view
        // above, so the revealed state is on screen, and a full-page capture
        // of a very tall mobile list is what pushed the first real run past
        // its timeout. The page-level captures (visitAsUser) stay fullPage —
        // those are for judging the whole screen.
        await page.screenshot({ path: screenshot });
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

      // Restore the baseline before the next candidate, ESCAPE FIRST.
      //
      // The obvious "click it again to toggle it back" is not enough, and
      // assuming it was cost a second round of false findings: the mobile nav
      // trigger is open-only (`setMobileNavOpen(true)`, not a toggle), so
      // clicking it again re-opened the drawer instead of closing it, leaving
      // its full-screen scrim to swallow every later click on that screen —
      // the notification bell then reported dead on all 9 screens, at mobile
      // only, which read exactly like a real product bug and wasn't
      // (2026-08-02).
      //
      // Escape is the reliable restore: drawers, popovers and dialogs all
      // listen for it. The re-click is kept only as a fallback for controls
      // that are genuine toggles and ignore Escape, and only when the page
      // has not already returned to its baseline.
      if (Date.now() - startedAt <= SWEEP_BUDGET_MS) {
        await page.keyboard.press("Escape").catch(() => undefined);
        await page.waitForTimeout(150);
        if (changed && (await domSignature(page)) !== before) {
          await el.click({ timeout: 5_000 }).catch(() => undefined);
          await page.waitForTimeout(150);
        }
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
