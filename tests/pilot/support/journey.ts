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

/**
 * What must be on screen for a page to count as actually verified.
 *
 * Exists because of a real, expensive miss (2026-08-02): the pilot reported
 * `PILOT PASS` with a full row of ✅ for `web-audit` across all three
 * viewports on a PR that redesigned that entire screen — while every
 * screenshot showed the same empty state ("Todavía no has auditado tu web"),
 * because the pilot account's project had no audit data. Nothing in the
 * harness distinguished "the redesigned screen rendered correctly" from "a
 * placeholder rendered correctly", so a green check certified nothing and the
 * founder found the real defects by hand.
 *
 * A screen whose real content never rendered is UNVERIFIED, and the pilot's
 * own first principle ("never report PASS for something you did not see")
 * means unverified must be loud, not silent.
 */
export interface ContentAnchor {
  /** CSS selector that must resolve to a visible element. */
  selector?: string;
  /** Visible text that must appear somewhere on the page. */
  text?: RegExp;
}

export interface ContentExpectation {
  /** Human-readable: what the anchors below prove is on screen. Quoted in the failure. */
  describedAs: string;
  /** Any ONE of these being visible is enough — screens legitimately vary. */
  anyOf: ContentAnchor[];
}

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
  /**
   * null when the journey declared no expectation for this screen; true/false
   * when it did. `false` means the page loaded fine and showed nothing worth
   * judging — an empty state, a plan gate, a skeleton that never resolved.
   */
  renderedRealContent: boolean | null;
  /** Echoes `ContentExpectation.describedAs`, so the JSONL says what was expected. */
  expectedContent: string | null;
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
  /** Real content height, including inside the shell's inner scroll container. */
  contentHeight: number;
  /** Viewport height the screenshot was taken at. */
  capturedHeight: number;
  /** True when the page was taller than the capture ceiling and got cut. */
  captureTruncated: boolean;
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
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

/**
 * Playwright derives an attachment's on-disk filename from the attachment
 * NAME (sanitized, plus a hash suffix) — NOT from `path`. A long name
 * therefore blows past the 255-byte filename limit and kills the journey
 * with ENAMETOOLONG, even when the screenshot itself wrote fine because
 * `slug()` had already truncated the path.
 *
 * Hit for real (2026-08-02): the interaction sweeper names attachments after
 * the control's accessible name, and an InfoTip whose aria-label is a full
 * explanatory sentence failed all three viewports at once. A control's
 * accessible name is arbitrary product copy — the harness must never assume
 * it is short, and a screenshot filename must never be able to fail a run
 * that the product itself passed.
 */
const MAX_ATTACHMENT_NAME = 80;

export function attachmentName(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length <= MAX_ATTACHMENT_NAME
    ? collapsed
    : `${collapsed.slice(0, MAX_ATTACHMENT_NAME - 1)}…`;
}

function recordFindings(findings: PageFindings): void {
  mkdirSync(".pilot", { recursive: true });
  appendFileSync(FINDINGS_PATH, `${JSON.stringify(findings)}\n`);
}

/**
 * Horizontal-overflow measurement (2026-08-03, PR #289): `horizontalOverflow`
 * used to compare `document.documentElement.scrollWidth` against the
 * viewport, which can never trip on a console screen. Setting `overflow-y:
 * auto` on `.dash-content` without an explicit `overflow-x` computes
 * `overflow-x: auto` too (CSS overflow shorthand rules), so `.dash-content`
 * clips and independently scrolls any horizontal overflow itself — it never
 * reaches the document. Proven dead across 27/27 real findings, all of which
 * had `scrollWidth === viewportWidth`. It is measured against `.dash-content`
 * directly below, since that element is the actual clipping box on every
 * dashboard screen.
 *
 * The vertical half of that same blindness is fixed by the capture code
 * below, which arrived independently on `main`. Its approach — growing the
 * viewport rather than stripping the shell's `overflow: hidden` — is the one
 * kept: it captures a layout the product actually renders, and it bounds the
 * result instead of letting a runaway list produce an unreadable PNG.
 */

/**
 * Ceiling on how tall a capture may grow. A runaway list would otherwise
 * produce a PNG too large to read (and too large to attach). When a page is
 * taller than this the capture is truncated — and `captureTruncated` says so,
 * because a silently cropped screenshot reads exactly like a complete one.
 */
const MAX_CAPTURE_HEIGHT = 6_000;

/**
 * How tall the page's real content is, INCLUDING content inside an inner
 * scroll container.
 *
 * `fullPage: true` grows the capture to `document.documentElement.scrollHeight`
 * and no further. The app shell pins itself to the viewport
 * (`.shell { height: 100dvh; overflow: hidden }`, app/globals.css) and scrolls
 * an inner element instead, so that number never exceeds one viewport — and
 * every "full-page" capture of an authenticated screen was silently cropped at
 * the fold. Found 2026-08-03, when the pilot could not see the Overview's
 * position headline or any panorama row past the third at any viewport; it had
 * been blind on every dashboard screen, not just that one.
 */
async function measureContentHeight(page: Page): Promise<number> {
  return page.evaluate(() => {
    let tallest = document.documentElement.scrollHeight;
    for (const el of document.querySelectorAll("*")) {
      if (el.scrollHeight <= el.clientHeight + 1) continue;
      const overflowY = window.getComputedStyle(el).overflowY;
      if (overflowY !== "auto" && overflowY !== "scroll") continue;
      const top = el.getBoundingClientRect().top + window.scrollY;
      tallest = Math.max(tallest, top + el.scrollHeight);
    }
    return Math.ceil(tallest);
  });
}

export type CaptureResult = {
  /** Real content height measured before capturing. */
  contentHeight: number;
  /** Viewport height the capture was actually taken at. */
  capturedHeight: number;
  /** True when content exceeded MAX_CAPTURE_HEIGHT and was cut. */
  captureTruncated: boolean;
};

/**
 * Screenshots the whole screen, not just the part above the fold.
 *
 * Rather than stripping the shell's `overflow: hidden` — which would capture a
 * layout the product never renders — this grows the *viewport* to the content
 * height and lets the app lay itself out honestly at that size, then restores
 * it. Width is untouched, so the responsive breakpoint under test never
 * changes.
 */
async function captureFullContent(page: Page, path: string): Promise<CaptureResult> {
  const viewport = page.viewportSize();
  const contentHeight = await measureContentHeight(page);

  if (!viewport || contentHeight <= viewport.height + 2) {
    await page.screenshot({ path, fullPage: true });
    return { contentHeight, capturedHeight: viewport?.height ?? contentHeight, captureTruncated: false };
  }

  const capturedHeight = Math.min(contentHeight, MAX_CAPTURE_HEIGHT);
  await page.setViewportSize({ width: viewport.width, height: capturedHeight });
  // Let the app reflow and any viewport-dependent client component settle.
  await page.waitForTimeout(400);
  try {
    await page.screenshot({ path, fullPage: true });
  } finally {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(200);
  }

  return { contentHeight, capturedHeight, captureTruncated: contentHeight > MAX_CAPTURE_HEIGHT };
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
  label: string,
  expectation?: ContentExpectation
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
    // `.dash-content` (see the horizontal-overflow note above), not
    // document.documentElement — on a dashboard screen the document never
    // overflows, `.dash-content` does, on its own independent axis. Still
    // check the document too: non-console pages (/login) have no
    // `.dash-content` and scroll normally.
    const scrollWidth = await page.evaluate(() => {
      const content = document.querySelector<HTMLElement>(".dash-content");
      return Math.max(document.documentElement.scrollWidth, content?.scrollWidth ?? 0);
    });
    const finalUrl = page.url();
    const bouncedToLogin = /\/login/.test(finalUrl) && !path.includes("/login");
    // 2px of slack absorbs sub-pixel rounding without hiding a real overflow.
    const horizontalOverflow = scrollWidth > viewport.width + 2;

    // Checked BEFORE the screenshot so a failure and its evidence describe the
    // same moment.
    let renderedRealContent: boolean | null = null;
    if (expectation) {
      renderedRealContent = false;
      for (const anchor of expectation.anyOf) {
        if (anchor.selector) {
          const hit = await page.locator(anchor.selector).first().isVisible().catch(() => false);
          if (hit) {
            renderedRealContent = true;
            break;
          }
        }
        if (anchor.text) {
          const hit = await page.getByText(anchor.text).first().isVisible().catch(() => false);
          if (hit) {
            renderedRealContent = true;
            break;
          }
        }
      }
    }

    const headerInteractiveControls = await page.evaluate(() => {
      const header = document.querySelector(".ov-sticky-header");
      if (!header) return [];
      const controls = header.querySelectorAll("button, a[href], input, select, textarea");
      return Array.from(controls).map((el) => {
        const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
        return `${el.tagName.toLowerCase()}${text ? `:"${text}"` : ""}`;
      });
    });

    // Culprits are measured BEFORE the capture, while the viewport is still
    // the one under test — captureFullContent resizes it and puts it back.
    const overflowCulprits = horizontalOverflow ? await findOverflowCulprits(page, viewport.width) : [];

    const screenshot = `${SCREENS_DIR}/${slug(testInfo.project.name)}--${slug(label)}.png`;
    mkdirSync(SCREENS_DIR, { recursive: true });
    const capture = await captureFullContent(page, screenshot);

    const findings: PageFindings = {
      label,
      path,
      viewport: testInfo.project.name,
      finalUrl: redact(finalUrl),
      scrollWidth,
      viewportWidth: viewport.width,
      horizontalOverflow,
      overflowCulprits,
      consoleErrors,
      failedRequests,
      thirdPartyFailures,
      bouncedToLogin,
      screenshot,
      renderedRealContent,
      expectedContent: expectation?.describedAs ?? null,
      headerInteractiveControls,
      ...capture
    };

    recordFindings(findings);
    await testInfo.attach(attachmentName(`${label} (${testInfo.project.name})`), {
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

  expect(
    findings.headerInteractiveControls,
    `${findings.label}: the shared sticky header must stay purely informational ` +
      `(badges/pills only) — docs/brand/design-decisions-log.md §3. Found interactive ` +
      `control(s) inside .ov-sticky-header, which belong in the page body instead.`
  ).toEqual([]);

  // Deliberately the LAST assertion: the ones above describe a broken screen,
  // this one describes a screen the pilot never got to judge. Both fail the
  // run, but only this one is fixed by seeding data rather than by changing
  // product code, so it should not mask a real defect above it.
  if (findings.renderedRealContent !== null) {
    expect(
      findings.renderedRealContent,
      `${findings.label} @ ${findings.viewport}: the page loaded without errors but never ` +
        `rendered ${findings.expectedContent} — this is an empty state, a plan gate, or an ` +
        `unresolved skeleton, NOT the screen this journey exists to verify. Reporting it as ` +
        `passing would certify a placeholder (real incident, 2026-08-02: a full-screen redesign ` +
        `shipped with a green pilot because every capture showed "Todavía no has auditado tu web"). ` +
        `Fix by seeding the pilot account with real data — run the "Agentic User Pilot (write)" ` +
        `workflow, whose seed journey creates a project, scans it and audits it. ` +
        `See docs/agentic-user-pilot.md § "Datos reales".`
    ).toBe(true);
  }
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
 *
 * Deliberately viewport-sized, unlike `visitAsUser`: growing the viewport to
 * capture a whole screen reflows the page, which would move an element out
 * from under the cursor and dismiss the very `:hover` state being captured.
 * The revealed element has already been scrolled into view, so the viewport is
 * where it is.
 */
export async function captureInteraction(page: Page, testInfo: TestInfo, label: string): Promise<string> {
  const screenshot = `${SCREENS_DIR}/${slug(testInfo.project.name)}--${slug(label)}.png`;
  mkdirSync(SCREENS_DIR, { recursive: true });
  await page.screenshot({ path: screenshot });
  await testInfo.attach(attachmentName(`${label} (${testInfo.project.name})`), {
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

  const [first] = await discoverProjectIds(page);
  if (!first) {
    throw new Error(
      "Pilot account has no project to inspect. Seed the pilot account with a " +
        "project that already has completed scans, or set PILOT_PROJECT_ID."
    );
  }
  return first;
}

/**
 * Every project on the pilot account, in list order.
 *
 * One project only ever exercises one shape of data. The account's projects
 * differ in the ways that matter for judging a screen — how many scans they
 * have, whether the brand is mentioned at all, how many competitors the AI
 * names — so walking a second one is the cheapest way to reach states the
 * primary project simply cannot produce (founder, 2026-08-03: *"si cambias de
 * proyecto escaneado, por ejemplo Movistar, ahí puedes probar otras
 * casuísticas"*).
 */
export async function discoverProjectIds(page: Page): Promise<string[]> {
  await page.goto("/dashboard/projects", { waitUntil: "domcontentloaded" });

  const hrefs = await page
    .locator('a[href^="/dashboard/projects/"]')
    .filter({ hasNotText: /nuevo|new/i })
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href") ?? ""));

  const ids: string[] = [];
  for (const href of hrefs) {
    const id = href.match(/\/dashboard\/projects\/([^/?#]+)/)?.[1];
    // "new" is the create route, not a project; the list also links each
    // project from several places, so the same id shows up more than once.
    if (!id || id === "new" || ids.includes(id)) continue;
    ids.push(id);
  }
  return ids;
}
