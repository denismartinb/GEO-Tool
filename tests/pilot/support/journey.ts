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
  /** Populated only when horizontalOverflow is true — see findOverflowCulprits(). */
  overflowCulprits: string[];
  consoleErrors: string[];
  failedRequests: string[];
  thirdPartyFailures: string[];
  bouncedToLogin: boolean;
  screenshot: string;
}

/**
 * Identifies which element(s) actually extend past the viewport's right
 * edge when a page fails the horizontal-overflow check, instead of leaving
 * the reviewer to guess from a screenshot alone. Deliberately walks every
 * element in the document (not `document.body *`) — a third-party overlay
 * a preview host injects can be appended as a sibling of <body> directly
 * under <html>, outside where an app-level fix could ever reach it, and
 * that distinction is exactly what a screenshot cannot show.
 */
async function findOverflowCulprits(page: Page, viewportWidth: number): Promise<string[]> {
  return page.evaluate((width) => {
    const results: string[] = [];
    for (const el of document.querySelectorAll("*")) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      if (rect.right <= width + 2) continue;
      const id = el.id ? `#${el.id}` : "";
      const cls = el.className && typeof el.className === "string" ? `.${el.className.trim().split(/\s+/).join(".")}` : "";
      const parent = el.parentElement;
      const parentDesc = parent ? `${parent.tagName.toLowerCase()}${parent.id ? `#${parent.id}` : ""}` : "(none)";
      results.push(
        `${el.tagName.toLowerCase()}${id}${cls} — right:${Math.round(rect.right)}px left:${Math.round(rect.left)}px, parent:${parentDesc}`
      );
      if (results.length >= 5) break;
    }
    return results;
  }, viewportWidth);
}

function slug(text: string): string {
  // Bounded like explore.ts's: an unbounded slug builds an unbounded path, and
  // captureInteraction is called with free-form labels.
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

/**
 * Playwright turns an attachment's NAME into its on-disk filename, so a
 * free-form label has to be bounded or the copy fails with ENAMETOOLONG. Same
 * helper and limit as explore.ts.
 */
function attachName(text: string, limit = 70): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > limit ? `${clean.slice(0, limit - 1)}…` : clean;
}

/**
 * Makes `fullPage: true` actually mean full page.
 *
 * The dashboard shell is `height: 100vh; overflow: hidden` with an inner
 * `overflow-y: auto` content column, so the DOCUMENT never grows past the
 * viewport — and Playwright's fullPage capture measures the document. The
 * result, silently, for every dashboard screen the pilot has ever shot: a
 * screenshot of the top fold only, indistinguishable from a full one. Filters,
 * lists and anything below the first screen were never in the evidence anybody
 * judged (found by the ux-pilot agent reviewing PR #301's own screenshots).
 *
 * Temporarily neutralises the clipping on the real scroller and its ancestors,
 * then restores it. Deliberately generic — it looks for whatever element is
 * actually scrolling rather than hardcoding product class names, so it keeps
 * working if the shell is restructured. Fails soft: if anything goes wrong the
 * caller still gets its (fold-only) screenshot rather than a broken run.
 */
async function expandInnerScroller(page: Page): Promise<() => Promise<void>> {
  const applied = await page
    .evaluate(() => {
      const scroller = Array.from(document.querySelectorAll<HTMLElement>("*")).find((el) => {
        const style = getComputedStyle(el);
        const scrolls = style.overflowY === "auto" || style.overflowY === "scroll";
        return scrolls && el.scrollHeight > el.clientHeight + 40;
      });
      if (!scroller) return false;

      const touched: Array<{ el: HTMLElement; height: string; maxHeight: string; overflow: string }> = [];
      for (let el: HTMLElement | null = scroller; el; el = el.parentElement) {
        touched.push({
          el,
          height: el.style.height,
          maxHeight: el.style.maxHeight,
          overflow: el.style.overflow,
        });
        el.style.height = "auto";
        el.style.maxHeight = "none";
        el.style.overflow = "visible";
      }
      (window as unknown as { __pilotRestore?: () => void }).__pilotRestore = () => {
        for (const t of touched) {
          t.el.style.height = t.height;
          t.el.style.maxHeight = t.maxHeight;
          t.el.style.overflow = t.overflow;
        }
      };
      return true;
    })
    .catch(() => false);

  if (!applied) return async () => {};
  // Let the reflow settle so the capture measures the expanded document.
  await page.waitForTimeout(150);
  return async () => {
    await page
      .evaluate(() => (window as unknown as { __pilotRestore?: () => void }).__pilotRestore?.())
      .catch(() => undefined);
  };
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
    // 2px of slack absorbs sub-pixel rounding without hiding a real overflow.
    const horizontalOverflow = scrollWidth > viewport.width + 2;

    const screenshot = `${SCREENS_DIR}/${slug(testInfo.project.name)}--${slug(label)}.png`;
    mkdirSync(SCREENS_DIR, { recursive: true });
    const restoreScroll = await expandInnerScroller(page);
    await page.screenshot({ path: screenshot, fullPage: true });
    await restoreScroll();

    const findings: PageFindings = {
      label,
      path,
      viewport: testInfo.project.name,
      finalUrl: redact(finalUrl),
      scrollWidth,
      viewportWidth: viewport.width,
      horizontalOverflow,
      overflowCulprits: horizontalOverflow ? await findOverflowCulprits(page, viewport.width) : [],
      consoleErrors,
      failedRequests,
      thirdPartyFailures,
      bouncedToLogin,
      screenshot
    };

    recordFindings(findings);
    await testInfo.attach(`${attachName(label)} (${testInfo.project.name})`, {
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
      `scrollWidth ${findings.scrollWidth}px > viewport ${findings.viewportWidth}px` +
      (findings.overflowCulprits.length
        ? `\nCulprit(s):\n  ${findings.overflowCulprits.join("\n  ")}`
        : "")
  ).toBe(false);

  expect(
    findings.failedRequests,
    `${findings.label}: first-party requests failed`
  ).toEqual([]);

  expect(
    findings.consoleErrors,
    `${findings.label}: console errors`
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
  await testInfo.attach(`${attachName(label)} (${testInfo.project.name})`, {
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
