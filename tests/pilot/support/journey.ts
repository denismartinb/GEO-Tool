import { appendFileSync, mkdirSync } from "node:fs";
import { expect, type Page, type TestInfo } from "@playwright/test";
import { redact } from "./env";

const SCREENS_DIR = ".pilot/screens";
const FINDINGS_PATH = ".pilot/findings.jsonl";

/**
 * Console noise that says nothing about whether the product works. Anything not
 * matched here is treated as a real error — the pilot is deliberately strict,
 * because a silent console regression is precisely what slips past a human
 * smoke test.
 */
const IGNORED_CONSOLE_PATTERNS: RegExp[] = [
  /favicon/i,
  /\bposthog\b/i,
  /\bsentry\b/i,
  /Download the React DevTools/i,
  /googletagmanager|google-analytics/i
];

/** Third-party hosts whose failures are recorded but never fail the journey. */
const THIRD_PARTY_HOSTS = /posthog|sentry|stripe|google|gstatic|vercel-insights|vitals/i;

export interface PageFindings {
  label: string;
  path: string;
  viewport: string;
  finalUrl: string;
  scrollWidth: number;
  viewportWidth: number;
  horizontalOverflow: boolean;
  consoleErrors: string[];
  failedRequests: string[];
  thirdPartyFailures: string[];
  bouncedToLogin: boolean;
  screenshot: string;
  /**
   * Interactive controls (button/link/input/select) found inside the shared
   * sticky header (`.ov-sticky-header`). Mechanical, not judgement: the
   * header is documented shared chrome across every console page
   * (docs/brand/design-decisions-log.md §3 — "el contexto vive entero en el
   * sticky-header... título de sección + pill de fecha", never an action).
   * Real case (2026-08-02, WEB-AUDIT-ISSUES-1 fase 2): a page shipped an
   * "Auditar ahora" button in its header and neither the automated pilot nor
   * a design-fidelity read caught it, because nothing mechanically checked
   * for it — this exists so that class of regression fails on its own from
   * now on, on every page, without needing anyone to notice a screenshot.
   */
  headerInteractiveControls: string[];
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function recordFindings(findings: PageFindings): void {
  mkdirSync(".pilot", { recursive: true });
  appendFileSync(FINDINGS_PATH, `${JSON.stringify(findings)}\n`);
}

/**
 * Navigates to `path` as the logged-in pilot user, captures a full-page
 * screenshot, and collects the hard signals that can be judged mechanically.
 *
 * What it does NOT do is decide whether the screen *looks right* or whether it
 * matches what the PR promised. That judgement belongs to the `ux-pilot` agent,
 * which reads the returned screenshot with vision. This helper's job is to make
 * sure the agent never has to guess about the things a machine can know for
 * certain.
 */
export async function visitAsUser(
  page: Page,
  testInfo: TestInfo,
  path: string,
  label: string
): Promise<PageFindings> {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  const thirdPartyFailures: string[] = [];

  const onConsole = (message: {
    type: () => string;
    text: () => string;
    location: () => { url?: string };
  }) => {
    if (message.type() !== "error") return;
    // Chromium reports failed subresources as a bare "Failed to load resource:
    // 404" with the URL only in `location()`. Without it the noise filters below
    // can never match, and the reported error tells a reviewer nothing.
    const sourceUrl = message.location()?.url ?? "";
    const text = sourceUrl ? `${message.text()} (${sourceUrl})` : message.text();
    if (IGNORED_CONSOLE_PATTERNS.some((pattern) => pattern.test(text))) return;
    consoleErrors.push(redact(text));
  };

  const onResponse = (response: { status: () => number; url: () => string }) => {
    const status = response.status();
    if (status < 400) return;
    const entry = `${status} ${redact(response.url())}`;
    if (THIRD_PARTY_HOSTS.test(response.url())) thirdPartyFailures.push(entry);
    else failedRequests.push(entry);
  };

  page.on("console", onConsole);
  page.on("response", onResponse);

  try {
    await page.goto(path, { waitUntil: "networkidle" }).catch(async () => {
      // networkidle can never settle on a page with long-polling; fall back to
      // the weaker guarantee rather than failing the whole journey.
      await page.goto(path, { waitUntil: "domcontentloaded" });
    });

    // Give client components a beat to hydrate before measuring layout.
    await page.waitForTimeout(1_000);

    const viewport = page.viewportSize() ?? { width: 0, height: 0 };
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const finalUrl = page.url();
    const bouncedToLogin = /\/login/.test(finalUrl) && !path.includes("/login");

    const headerInteractiveControls = await page.evaluate(() => {
      const header = document.querySelector(".ov-sticky-header");
      if (!header) return [];
      const controls = header.querySelectorAll("button, a[href], input, select, textarea");
      return Array.from(controls).map((el) => {
        const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
        return `${el.tagName.toLowerCase()}${text ? `:"${text}"` : ""}`;
      });
    });

    const screenshot = `${SCREENS_DIR}/${slug(testInfo.project.name)}--${slug(label)}.png`;
    mkdirSync(SCREENS_DIR, { recursive: true });
    await page.screenshot({ path: screenshot, fullPage: true });

    const findings: PageFindings = {
      label,
      path,
      viewport: testInfo.project.name,
      finalUrl: redact(finalUrl),
      scrollWidth,
      viewportWidth: viewport.width,
      // 2px of slack absorbs sub-pixel rounding without hiding a real overflow.
      horizontalOverflow: scrollWidth > viewport.width + 2,
      consoleErrors,
      failedRequests,
      thirdPartyFailures,
      bouncedToLogin,
      screenshot,
      headerInteractiveControls
    };

    recordFindings(findings);
    await testInfo.attach(`${label} (${testInfo.project.name})`, {
      path: screenshot,
      contentType: "image/png"
    });

    return findings;
  } finally {
    page.off("console", onConsole);
    page.off("response", onResponse);
  }
}

/**
 * Fails the journey on the signals no screenshot review should ever have to
 * catch. Kept separate from `visitAsUser` so a journey can record a page
 * without asserting on it (useful for intermediate navigation steps).
 */
export function assertPageIsHealthy(findings: PageFindings): void {
  expect(
    findings.bouncedToLogin,
    `${findings.label}: session was rejected — landed on ${findings.finalUrl}`
  ).toBe(false);

  expect(
    findings.horizontalOverflow,
    `${findings.label} @ ${findings.viewport}: horizontal overflow — ` +
      `scrollWidth ${findings.scrollWidth}px > viewport ${findings.viewportWidth}px`
  ).toBe(false);

  expect(
    findings.failedRequests,
    `${findings.label}: first-party requests failed`
  ).toEqual([]);

  expect(
    findings.consoleErrors,
    `${findings.label}: console errors`
  ).toEqual([]);

  expect(
    findings.headerInteractiveControls,
    `${findings.label}: the shared sticky header must stay purely informational ` +
      `(badges/pills only) — docs/brand/design-decisions-log.md §3. Found interactive ` +
      `control(s) inside .ov-sticky-header, which belong in the page body instead.`
  ).toEqual([]);
}

/**
 * Captures the CURRENT page state — mid-interaction, no navigation — as
 * real evidence rather than a claim. Use this after a hover/click that
 * reveals something a plain page-load screenshot can never show (a tooltip
 * bubble, an expanded detail panel): pair it with a Playwright `expect(...)
 * .toBeVisible()` on the revealed element first, so the test actually FAILS
 * if the interaction doesn't work, instead of silently screenshotting a
 * closed state and letting it pass for "verified" (founder request,
 * 2026-08-02: "quiero la evidencia de que verificaste el click").
 */
export async function captureInteraction(page: Page, testInfo: TestInfo, label: string): Promise<string> {
  const screenshot = `${SCREENS_DIR}/${slug(testInfo.project.name)}--${slug(label)}.png`;
  mkdirSync(SCREENS_DIR, { recursive: true });
  await page.screenshot({ path: screenshot, fullPage: true });
  await testInfo.attach(`${label} (${testInfo.project.name})`, {
    path: screenshot,
    contentType: "image/png"
  });
  return screenshot;
}

/**
 * Asserts a revealed element is not just "visible" to Playwright but actually
 * legible to a human: fully inside the viewport horizontally, and not clipped
 * by an ancestor's `overflow: hidden`.
 *
 * Why this exists: `expect(bubble).toBeVisible()` passed for a KPI tooltip
 * that was rendering half-cut behind its own card (`overflow: hidden` on the
 * parent). The assertion was green and the UX was broken — only looking at
 * the capture caught it (founder, 2026-08-02: "no solo pruebe que sale, sino
 * que sale bien"). That class of defect is mechanically detectable, so it
 * belongs in an assertion rather than in a human's judgement.
 */
export async function assertFullyVisible(
  page: Page,
  selector: string,
  description: string
): Promise<void> {
  const geometry = await page.locator(selector).first().evaluate((node: Element) => {
    const rect = node.getBoundingClientRect();
    let clippedBy: string | null = null;
    for (let parent = node.parentElement; parent; parent = parent.parentElement) {
      const style = window.getComputedStyle(parent);
      if (style.overflow === "visible" && style.overflowX === "visible" && style.overflowY === "visible") continue;
      const parentRect = parent.getBoundingClientRect();
      const escapes =
        rect.top < parentRect.top - 1 ||
        rect.bottom > parentRect.bottom + 1 ||
        rect.left < parentRect.left - 1 ||
        rect.right > parentRect.right + 1;
      if (escapes) {
        clippedBy = `${parent.tagName.toLowerCase()}.${parent.className || "(no class)"}`.slice(0, 80);
        break;
      }
    }
    return {
      left: rect.left,
      right: rect.right,
      width: rect.width,
      height: rect.height,
      viewportWidth: window.innerWidth,
      clippedBy
    };
  });

  expect(
    geometry.width > 0 && geometry.height > 0,
    `${description}: revealed element has zero size — nothing actually appeared`
  ).toBe(true);

  expect(
    geometry.clippedBy,
    `${description}: revealed element is clipped by an ancestor with overflow hidden (${geometry.clippedBy}) — ` +
      `it is "visible" to the DOM but cut off on screen`
  ).toBeNull();

  expect(
    geometry.left >= -1 && geometry.right <= geometry.viewportWidth + 1,
    `${description}: revealed element runs outside the viewport horizontally ` +
      `(${Math.round(geometry.left)}…${Math.round(geometry.right)}px vs ${geometry.viewportWidth}px wide)`
  ).toBe(true);
}

/**
 * Resolves the project the journeys should exercise: the pinned
 * `PILOT_PROJECT_ID` when set, otherwise the first project on the pilot
 * account. Discovery keeps the pilot working on a fresh pilot account without
 * another env var to maintain.
 */
export async function resolveProjectId(page: Page): Promise<string> {
  const pinned = process.env.PILOT_PROJECT_ID?.trim();
  if (pinned) return pinned;

  await page.goto("/dashboard/projects", { waitUntil: "domcontentloaded" });

  const href = await page
    .locator('a[href^="/dashboard/projects/"]')
    .filter({ hasNotText: /nuevo|new/i })
    .first()
    .getAttribute("href");

  const match = href?.match(/\/dashboard\/projects\/([^/?#]+)/);
  const projectId = match?.[1];

  if (!projectId || projectId === "new") {
    throw new Error(
      "Pilot account has no project to inspect. Seed the pilot account with a " +
        "project that already has completed scans, or set PILOT_PROJECT_ID."
    );
  }

  return projectId;
}
