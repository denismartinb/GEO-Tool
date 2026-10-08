// Drives the LOCKED preview (VERCEL_ENV=preview, fake Supabase tripwire) and records, for each page, every request the
// BROWSER attempts. Anything not to localhost is aborted here (so nothing leaves this machine) but still listed.
const { createRequire } = require("module");
const req = createRequire("/home/user/GEO-Tool/package.json");
let pw; try { pw = req("playwright"); } catch { pw = req("@playwright/test"); }
const fs = require("fs"), path = require("path");
const OUT = __dirname, BASE = "http://localhost:3111";
const PAGES = [["pricing", "/pricing"], ["home", "/"], ["guia", "/preview/index.html"], ["email-d5", "/preview/emails/trial-d5.html"]];
(async () => {
  const browser = await pw.chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
  const log = [];
  for (const [vpName, w, h] of [["390", 390, 844], ["768", 768, 900], ["1280", 1280, 800]]) {
    for (const [name, p] of PAGES) {
      if (vpName === "768" && name !== "pricing") continue;
      const ctx = await browser.newContext({ viewport: { width: w, height: h } });
      const page = await ctx.newPage();
      const attempts = [];
      await page.route("**/*", (r) => {
        const u = r.request().url();
        attempts.push(`${r.request().method()} ${u}`);
        return u.startsWith(BASE) ? r.continue() : r.abort();
      });
      const resp = await page.goto(BASE + p, { waitUntil: "load" });
      await page.waitForTimeout(1800);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      await page.screenshot({ path: path.join(OUT, `${name}-${vpName}.png`), fullPage: name === "pricing" || name === "guia" || name === "email-d5" });
      const nonLocal = attempts.filter((a) => !a.split(" ")[1].startsWith(BASE));
      log.push({ page: p, viewport: vpName, status: resp.status(), pageOverflowPx: overflow, requests: attempts.length, nonLocalAttempts: nonLocal, apiOrAuthAttempts: attempts.filter((a) => /\/api\/|\/auth\/|supabase|stripe/i.test(a)) });
      await ctx.close();
    }
  }
  // Pressing the CTAs must land on the inert page, never start anything.
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const posts = [];
  page.on("request", (r) => { if (r.method() !== "GET" && r.method() !== "HEAD") posts.push(`${r.method()} ${r.url()}`); });
  await page.route("**/*", (r) => (r.request().url().startsWith(BASE) ? r.continue() : r.abort()));
  await page.goto(BASE + "/pricing", { waitUntil: "load" });
  const links = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")).filter((h) => /signup|login|dashboard/.test(h || "")));
  const cta = page.locator('a[href*="signup"], a[href*="dashboard"]').first();
  let ctaResult = "no CTA found";
  if (await cta.count()) {
    const resp = await Promise.all([page.waitForNavigation().catch(() => null), cta.click({ trial: false })]).then(([r]) => r);
    ctaResult = `clicked → ${page.url()} status ${resp ? resp.status() : "n/a"}; body: ${(await page.textContent("body")).replace(/\s+/g, " ").slice(0, 90)}`;
    await page.screenshot({ path: path.join(OUT, "cta-click-1280.png") });
  }
  log.push({ ctaLinksSeen: [...new Set(links)].slice(0, 6), ctaResult, nonGetRequestsFromBrowser: posts });
  fs.writeFileSync(path.join(OUT, "network-log.json"), JSON.stringify(log, null, 2));
  await browser.close();
})();
