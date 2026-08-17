import { appendFileSync, mkdirSync } from "node:fs";
import { expect, type Page, type TestInfo } from "@playwright/test";
import { redact } from "./env";
import { findDuplicateControls, findLowContrastControls, type ControlSnapshot } from "./page-audit";

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
  /**
   * Sólo se rellena cuando `bouncedToLogin` es true: qué cookies de sesión
   * tenía el contexto EN ESE INSTANTE, por nombre. Ver `describeAuthState`.
   */
  authDiagnostics: string | null;
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
  /**
   * Identical interactive controls repeated inside one landmark — see
   * `findDuplicateControls`. Exists because the landing hero shipped its CTA
   * twice on 2026-08-11 and the capture that shows it went unjudged.
   */
  duplicateControls: string[];
  /**
   * Interactive controls whose text fails WCAG AA against their own
   * background — see `findLowContrastControls`. Exists because the same PR
   * turned the drawer's CTA grey-on-blue and nothing in the harness read a
   * colour.
   */
  lowContrastControls: string[];
  /** How many visible controls the two checks above were computed from. */
  controlsInspected: number;
  /**
   * El popup de bienvenida estaba abierto al llegar y se cerró antes de mirar
   * nada. Se registra en vez de silenciarse: si empieza a salir en pantallas
   * donde no debería, esto es lo que lo delata.
   */
  dismissedWelcomeTour: boolean;
  /**
   * El `<title>` del documento — ROOT-METADATA-1 (log §103).
   *
   * El piloto juzga capturas, y un título NO sale en una captura: es la clase
   * de cosa sobre la que su verde no dice absolutamente nada. Quince pantallas
   * de consola compartieron la misma pestaña «GenScore» durante meses con
   * `PILOT PASS` en todas las pasadas, porque nadie estaba mirando el único
   * sitio donde se veía.
   */
  documentTitle: string;
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

/**
 * Ceiling on how many controls are measured per page. A pathological list
 * would otherwise put thousands of records through the serialization boundary
 * for no extra signal — the checks that consume this look for repeats and for
 * unreadable text, and both show up in the first few hundred.
 */
const MAX_CONTROLS_INSPECTED = 400;

/**
 * Measures every visible interactive control on the page: what it is, where it
 * sits, and what colour it renders in. The JUDGING lives in `page-audit.ts` as
 * pure functions — this half only exists because a computed style cannot be
 * read outside a browser.
 *
 * Runs at the same moment as the screenshot, so a failure and its evidence
 * describe the same frame.
 */
async function collectControlSnapshots(page: Page): Promise<ControlSnapshot[]> {
  return page.evaluate((limit) => {
    const SELECTOR = 'button, a[href], input[type="submit"], input[type="button"], [role="button"]';
    const LANDMARKS = 'section, header, footer, main, aside, nav, form, dialog, [role="dialog"]';

    function describeElement(el: Element): string {
      const cls =
        typeof el.className === "string" && el.className.trim()
          ? `.${el.className.trim().split(/\s+/).join(".")}`
          : "";
      return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${cls}`;
    }

    function parseColor(value: string): [number, number, number, number] | null {
      const match = value.match(/rgba?\(([^)]+)\)/);
      if (!match) return null;
      const parts = match[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      if (parts.length < 3 || parts.slice(0, 3).some((n) => !Number.isFinite(n))) return null;
      const alpha = parts.length >= 4 && Number.isFinite(parts[3]) ? parts[3] : 1;
      return [parts[0], parts[1], parts[2], alpha];
    }

    /**
     * First fully opaque background found walking up from the element, or null
     * when it cannot be resolved honestly: a gradient or image anywhere in the
     * chain, a semi-transparent layer, or transparency all the way to the root.
     * Null means "not judged" — never "fine".
     */
    function resolveBackground(el: Element): string | null {
      let node: Element | null = el;
      while (node) {
        const style = getComputedStyle(node);
        if (style.backgroundImage && style.backgroundImage !== "none") return null;
        const colour = parseColor(style.backgroundColor);
        if (colour) {
          if (colour[3] === 1) return `${colour[0]},${colour[1]},${colour[2]}`;
          if (colour[3] > 0) return null;
        }
        node = node.parentElement;
      }
      return null;
    }

    /**
     * True when the control sits inside a list, a table row, or a run of at
     * least TWO identically shaped siblings. A card list with one "Seguir"
     * button per card is not a duplicated control, it is a list.
     *
     * The threshold was three on the first pass and it was wrong: the pilot's
     * very first real run flagged the two `.cm2-emg` suggestion cards on
     * Competidores, a list that happened to have exactly two items. Two is
     * the honest reading — what separates a list from a duplication bug is
     * not how many copies there are but whether their containers MATCH.
     *
     * The cost, stated rather than glossed: a duplication bug that leaves two
     * *identically shaped* containers behind is now invisible to this check.
     * The bug it was written for is not that shape (`.lp-hero-form` next to
     * `.lp-hero-actions` — same buttons, different wrappers), and the
     * alternative is firing on every two-item card list in the product, which
     * gets the whole check allow-listed into silence inside a week.
     */
    function inRepeatedStructure(el: Element, landmark: Element | null): boolean {
      let node: Element | null = el;
      while (node && node !== landmark) {
        if (/^(li|tr|td|th|option)$/.test(node.tagName.toLowerCase())) return true;
        const role = node.getAttribute("role");
        if (role === "listitem" || role === "row" || role === "gridcell") return true;
        const parent: Element | null = node.parentElement;
        if (parent) {
          const shape = `${node.tagName}|${typeof node.className === "string" ? node.className : ""}`;
          let alike = 0;
          for (const sibling of parent.children) {
            const siblingShape = `${sibling.tagName}|${
              typeof sibling.className === "string" ? sibling.className : ""
            }`;
            if (siblingShape === shape) alike += 1;
          }
          if (alike >= 2) return true;
        }
        node = parent;
      }
      return false;
    }

    const landmarkIds = new Map<Element, string>();
    const snapshots = [];

    for (const el of document.querySelectorAll(SELECTOR)) {
      if (snapshots.length >= limit) break;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none") continue;

      const landmark = el.closest(LANDMARKS);
      let group = "(document)";
      if (landmark) {
        let id = landmarkIds.get(landmark);
        if (!id) {
          id = `#${landmarkIds.size + 1} ${describeElement(landmark)}`;
          landmarkIds.set(landmark, id);
        }
        group = id;
      }

      const colour = parseColor(style.color);
      const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
      const name = (el.getAttribute("aria-label") ?? "").trim().replace(/\s+/g, " ").slice(0, 60) || text;

      snapshots.push({
        describe: `${describeElement(el)}${name ? ` "${name}"` : ""}`,
        group,
        tag: el.tagName.toLowerCase(),
        name,
        text,
        classes: typeof el.className === "string" ? el.className.trim() : "",
        href: el.getAttribute("href") ?? "",
        inRepeatedStructure: inRepeatedStructure(el, landmark),
        disabled:
          el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true",
        fontSizePx: Number.parseFloat(style.fontSize) || 16,
        bold: Number(style.fontWeight) >= 700 || style.fontWeight === "bold",
        // Semi-transparent text would have to be blended against the same
        // background to be judged; skip it rather than report a wrong ratio.
        color: colour && colour[3] === 1 ? `${colour[0]},${colour[1]},${colour[2]}` : "",
        background: resolveBackground(el)
      });
    }

    return snapshots;
  }, MAX_CONTROLS_INSPECTED);
}

/** The two mechanical control checks, as measured on the page's CURRENT state. */
export interface ControlAudit {
  duplicateControls: string[];
  lowContrastControls: string[];
  controlsInspected: number;
}

/**
 * Runs the duplicate and contrast checks against whatever is on screen right
 * now. `visitAsUser` calls it on load; a journey calls it directly after
 * opening something a page load can never show.
 *
 * That second use is not decoration. On 2026-08-11 the drawer CTA shipped
 * grey-on-blue and stayed invisible to 560 captures, because **not one of
 * them had the drawer open** — it only exists below 900px and only after a
 * click. A check that only ever runs on the closed state cannot see a defect
 * that only exists in the open one.
 */
export async function auditControls(page: Page): Promise<ControlAudit> {
  const controls = await collectControlSnapshots(page);
  return {
    duplicateControls: findDuplicateControls(controls),
    lowContrastControls: findLowContrastControls(controls),
    controlsInspected: controls.length
  };
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
    await page.screenshot({ path, fullPage: true, animations: "disabled" });
    return { contentHeight, capturedHeight: viewport?.height ?? contentHeight, captureTruncated: false };
  }

  const capturedHeight = Math.min(contentHeight, MAX_CAPTURE_HEIGHT);
  await page.setViewportSize({ width: viewport.width, height: capturedHeight });
  // Let the app reflow and any viewport-dependent client component settle.
  await page.waitForTimeout(400);
  try {
    await page.screenshot({ path, fullPage: true, animations: "disabled" });
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
/** Selector del scrim del popup de bienvenida (`components/tour-provider.tsx`). */
export const WELCOME_TOUR_SCRIM = ".ptour-scrim";

/**
 * Cierra el popup de bienvenida si está abierto. Devuelve si había uno.
 *
 * Pulsa su propia X, no `Escape` ni un clic fuera: si algún día la X deja de
 * cerrar, esto tiene que fallar en vez de taparlo con una vía alternativa.
 */
export async function dismissWelcomeTour(page: Page): Promise<boolean> {
  const scrim = page.locator(WELCOME_TOUR_SCRIM);
  if ((await scrim.count()) === 0) return false;
  if (!(await scrim.first().isVisible().catch(() => false))) return false;

  await page.locator(`${WELCOME_TOUR_SCRIM} .pt-close`).first().click({ timeout: 5_000 });
  await scrim.first().waitFor({ state: "hidden", timeout: 5_000 });
  return true;
}

/**
 * Lo que una ruta puede declarar sobre sí misma antes de visitarla.
 *
 * Hoy sólo una cosa, y existe porque el harness no podía pilotar una 404
 * NUNCA (NOT-FOUND-ROCKET-1, 2026-08-12): `onResponse` marca como fallo
 * cualquier respuesta ≥400 de primera parte, y en una página de error el
 * documento principal DEBE responder ≥400. El piloto reportaba
 * "first-party requests failed" por el único comportamiento que esa pantalla
 * está obligada a tener.
 *
 * Es deliberadamente estrecho: exime **una** respuesta, la del documento de
 * la ruta visitada, y **sólo** con el código declarado. Un 500 en esa misma
 * ruta, o un 404 de un subrecurso —un CSS que no carga, una imagen rota—
 * siguen tumbando la pasada, que es justo lo que esta comprobación existe
 * para detectar. Y no debilita la garantía de que la ruta responde 404: eso
 * lo asevera su propio test con `page.request.get`, aparte de esto.
 */
export interface VisitOptions {
  /** El documento de esta ruta responde con este código, y eso es correcto. */
  expectDocumentStatus?: number;
}

export async function visitAsUser(
  page: Page,
  testInfo: TestInfo,
  path: string,
  label: string,
  expectation?: ContentExpectation,
  options?: VisitOptions
): Promise<PageFindings> {
  const expectedDocStatus = options?.expectDocumentStatus;
  const visitedPath = path.split("?")[0].split("#")[0];
  /** ¿Es esta respuesta la del documento de la propia ruta que se visita? */
  const isVisitedDocument = (url: string): boolean => {
    try {
      return new URL(url).pathname.replace(/\/$/, "") === visitedPath.replace(/\/$/, "");
    } catch {
      return false;
    }
  };
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
    // Chromium también registra el status del documento como error de consola
    // ("Failed to load resource: ... 404"). Es el mismo hecho ya eximido
    // arriba, no un segundo problema: filtrarlo aquí evita que una sola 404
    // esperada cuente dos veces.
    if (
      expectedDocStatus !== undefined &&
      text.includes(String(expectedDocStatus)) &&
      isVisitedDocument(sourceUrl)
    ) {
      return;
    }
    consoleErrors.push(redact(text));
  };

  const onResponse = (response: { status: () => number; url: () => string }) => {
    const status = response.status();
    if (status < 400) return;
    if (expectedDocStatus !== undefined && status === expectedDocStatus && isVisitedDocument(response.url())) {
      return;
    }
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

    // El tour de bienvenida (ONBOARDING-TOUR-1) salta solo la primera vez que
    // se entra en la consola, y el piloto estrena navegador en cada pasada, así
    // que se lo encuentra abierto. Se cierra igual que haría una persona: es un
    // modal, tapa la pantalla entera y bloquea cualquier hover o clic detrás.
    // Sin esto, el 2026-08-07 tumbó seis pruebas —el tooltip de Páginas citadas
    // y la campana, en las tres anchuras— por `Timeout exceeded` contra
    // elementos que estaban perfectamente bien, sólo tapados.
    //
    // Cerrarlo no lo deja sin mirar: `onboarding-tour.spec.ts` es una pasada
    // dedicada que lo abre, comprueba que trae contenido de verdad y lo
    // fotografía antes de cerrarlo. Aquí sólo se quita de en medio.
    const dismissedWelcomeTour = await dismissWelcomeTour(page);

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

    // Same reason as the culprits below: `captureFullContent` resizes the
    // viewport, and both of these checks are viewport-dependent — the drawer
    // CTA regression only exists below 900px, and a responsive layout can
    // legitimately show one control at one width and two at another.
    const controlAudit = await auditControls(page);

    // Culprits are measured BEFORE the capture, while the viewport is still
    // the one under test — captureFullContent resizes it and puts it back.
    const overflowCulprits = horizontalOverflow ? await findOverflowCulprits(page, viewport.width) : [];

    // Sólo cuando hay rebote: leer cookies en cada visita sana es coste sin
    // información.
    const authDiagnostics = bouncedToLogin ? await describeAuthState(page) : null;

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
      authDiagnostics,
      screenshot,
      renderedRealContent,
      expectedContent: expectation?.describedAs ?? null,
      headerInteractiveControls,
      ...controlAudit,
      dismissedWelcomeTour,
      documentTitle: await page.title().catch(() => ""),
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
 * Fails on the two mechanical control defects — a control that renders twice,
 * and a control nobody can read. Separate from `assertPageIsHealthy` so a
 * journey can also apply it to an OPEN state (a drawer, a modal), which is the
 * only place some of these defects exist.
 */
export function assertControlsAreHealthy(label: string, viewport: string, audit: ControlAudit): void {
  expect(
    audit.duplicateControls,
    `${label} @ ${viewport}: the same control renders more than once inside one landmark. ` +
      `Real incident (2026-08-11): moving the landing hero's CTA into a client island left the ` +
      `original behind, so "Analiza gratis" shipped twice — the capture showed it plainly and ` +
      `nothing failed, because nothing counted. If a repeat is intentional, add it to ` +
      `DUPLICATE_ALLOW_LIST in tests/pilot/support/page-audit.ts with the reason.`
  ).toEqual([]);

  expect(
    audit.lowContrastControls,
    `${label} @ ${viewport}: interactive text below WCAG AA against its own background. ` +
      `Real incident (2026-08-11): the mobile drawer's CTA turned grey-on-blue when its element ` +
      `changed from <button> to <a>, because .lp-mobnav a (0,1,1) beats .lp-cta (0,1,0) — see ` +
      `.claude/rules/styles.md. If a value is deliberate, add it to CONTRAST_ALLOW_LIST in ` +
      `tests/pilot/support/page-audit.ts with the reason.`
  ).toEqual([]);
}

/**
 * Fails the journey on the signals no screenshot review should ever have to
 * catch. Kept separate from `visitAsUser` so a journey can record a page
 * without asserting on it (useful for intermediate navigation steps).
 */
/**
 * PRELAUNCH-HARDENING-1 Fase Q5 — instrumentación de la pérdida de sesión.
 *
 * El 2026-08-09 una pasada del piloto perdió la sesión en la última anchura y
 * **no se ha vuelto a reproducir en las pasadas posteriores sobre el mismo
 * código** (log §42). Con `retries: 0` deliberado, un rojo espurio en la puerta
 * enseña a ignorar los rojos, así que hace falta cerrarlo — pero la hipótesis
 * (el `storageState` único compartido por las tres anchuras secuenciales) **no
 * está probada**, y parchear una hipótesis sin datos es cómo se arregla el
 * síntoma equivocado. Lo primero es que, cuando vuelva a pasar, el fallo diga
 * algo.
 *
 * **Nombres, nunca valores.** Una cookie de sesión de Supabase ES la sesión:
 * volcar su valor al log de un run público sería regalar la cuenta del piloto.
 * Lo que se necesita para diagnosticar es si las cookies estaban, no qué
 * contenían.
 */
async function describeAuthState(page: Page): Promise<string> {
  try {
    const cookies = await page.context().cookies();
    if (cookies.length === 0) return "el contexto no tenía NINGUNA cookie";

    const authCookies = cookies.filter((cookie) => /^sb-|supabase/i.test(cookie.name));
    const nowSeconds = Date.now() / 1000;
    const described = authCookies.map((cookie) => {
      const expiry =
        cookie.expires && cookie.expires > 0
          ? cookie.expires < nowSeconds
            ? "CADUCADA"
            : `caduca en ${Math.round((cookie.expires - nowSeconds) / 60)} min`
          : "de sesión";
      return `${cookie.name} (${expiry})`;
    });

    return authCookies.length === 0
      ? `${cookies.length} cookie(s) en el contexto, ninguna de sesión de Supabase`
      : `cookies de sesión presentes: ${described.join(", ")}`;
  } catch (error) {
    return `no se pudo leer el estado de cookies: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export function assertPageIsHealthy(findings: PageFindings): void {
  expect(
    findings.bouncedToLogin,
    `${findings.label} @ ${findings.viewport}: session was rejected — landed on ${findings.finalUrl}\n` +
      `Estado de sesión en ese instante: ${findings.authDiagnostics ?? "(sin diagnóstico)"}\n` +
      "Si esto es la pérdida intermitente de sesión de log §42, ESTA línea es el dato que faltaba: " +
      "dice si el contexto llegó sin cookies (el `storageState` no se aplicó) o con ellas caducadas " +
      "(la sesión expiró a mitad de pasada). Son dos fallos distintos con dos arreglos distintos."
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

  // ROOT-METADATA-1 (log §103). Una pantalla sin `metadata` propia hereda el
  // `title` del layout raíz, que es la marca a secas. No rompe nada, no se ve
  // en la captura y no lo nota nadie — así llegaron a ser quince pantallas
  // indistinguibles entre sí. Comparar contra la marca exacta es a propósito:
  // un título que EMPIEZA por «GenScore» puede ser legítimo
  // («GenScore vs Otterly …»); el fallo es que sea sólo eso.
  expect(
    findings.documentTitle.trim(),
    `${findings.label} @ ${findings.viewport}: la pestaña dice sólo «GenScore», así que esta ` +
      "pantalla no declara `metadata` propia y hereda la del layout raíz. Con dos pantallas " +
      "abiertas son dos pestañas idénticas. Añade `consoleMetadata(\"…\")` o " +
      "`generateMetadata` con `projectScreenMetadata` (`lib/seo/console-metadata.ts`)."
  ).not.toBe("GenScore");

  assertControlsAreHealthy(findings.label, findings.viewport, findings);

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
export async function captureInteraction(
  page: Page,
  testInfo: TestInfo,
  label: string,
  opts: {
    /**
     * Capture the whole content instead of the viewport. Off by default,
     * because for a REVEAL the viewport is the point: a tooltip that renders
     * clipped or off-screen is the finding, and growing the viewport would
     * hide exactly that.
     *
     * Turn it on when the interaction reveals something TALLER than the fold,
     * where the viewport frame cuts off the very thing being verified — e.g.
     * the generated llms.txt, whose five publishing steps sit below the file
     * block and were invisible in every capture of the first run.
     */
    fullContent?: boolean;
  } = {}
): Promise<string> {
  const screenshot = `${SCREENS_DIR}/${slug(testInfo.project.name)}--${slug(label)}.png`;
  mkdirSync(SCREENS_DIR, { recursive: true });
  if (opts.fullContent) await captureFullContent(page, screenshot);
  // `animations: "disabled"` finishes running CSS animations and pins them to
  // their end state. Without it a capture taken right after a reveal catches
  // the element mid-fade: the notifications panel (`menuIn`, opacity 0→1 over
  // 140ms) was photographed half-transparent with the page bleeding through,
  // and a reviewing agent read that as a real rendering defect (2026-08-05).
  // Every popover, menu and drawer in the suite was subject to the same lie.
  else await page.screenshot({ path: screenshot, animations: "disabled" });
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
  /**
   * `/dashboard/domains`, no `/dashboard/projects` — DOMAINS-ARCHIVE-RETIRE-1
   * (log §104). Esa ruta pasó a ser una redirección, y apuntar el piloto a una
   * redirección con `waitUntil: "domcontentloaded"` es un fallo con nombre
   * propio: la espera resuelve sobre el documento intermedio, el navegador se
   * lleva la página por delante y el `evaluateAll` de abajo revienta con
   * *"Execution context was destroyed"*. Tumbó las tres anchuras del journey
   * de segundo proyecto y NO se parece en nada a su causa — parece un fallo de
   * red, no una ruta que ha cambiado de sitio.
   */
  await page.goto("/dashboard/domains", { waitUntil: "domcontentloaded" });

  /**
   * Dos formas de enlace, y hacen falta las dos: la rejilla enlaza el dominio
   * **activo** a su pantalla (`/dashboard/projects/<id>`) y los demás a un
   * cambio de activo (`/dashboard/domains?active=<id>`). Quedarse sólo con la
   * primera devolvería un único proyecto y el journey se saltaría en silencio
   * — que es justo lo que este journey existe para impedir.
   */
  const hrefs = await page
    .locator('a[href^="/dashboard/projects/"], a[href^="/dashboard/domains?active="]')
    .filter({ hasNotText: /nuevo|new/i })
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href") ?? ""));

  const ids: string[] = [];
  for (const href of hrefs) {
    const id =
      href.match(/\/dashboard\/projects\/([^/?#]+)/)?.[1] ??
      href.match(/\/dashboard\/domains\?active=([^&#]+)/)?.[1];
    // "new" is the create route, not a project; the list also links each
    // project from several places, so the same id shows up more than once.
    if (!id || id === "new" || ids.includes(id)) continue;
    ids.push(id);
  }
  return ids;
}
