const { createRequire } = require("module");
const req = createRequire("/home/user/GEO-Tool/package.json");
let pw;
try { pw = req("playwright"); } catch { pw = req("@playwright/test"); }
const OUT = "/home/user/GEO-Tool/docs/specs/billing/evidence/contract-99-b1b";
const BASE = "http://localhost:3111";
const VIEWPORTS = [{ name: "390", width: 390, height: 844 }, { name: "1280", width: 1280, height: 800 }];

(async () => {
  const browser = await pw.chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, reducedMotion: "no-preference" });
    const page = await ctx.newPage();
    // Nothing leaves this machine: every request that is not localhost is aborted (fonts included).
    await page.route("**/*", (route) => (route.request().url().startsWith(BASE) ? route.continue() : route.abort()));

    await page.goto(`${BASE}/pricing`, { waitUntil: "networkidle" });
    await page.screenshot({ path: `${OUT}/pricing-${vp.name}.png`, fullPage: true });

    await page.goto(`${BASE}/docs/planes-y-limites`, { waitUntil: "networkidle" });
    await page.screenshot({ path: `${OUT}/docs-planes-${vp.name}.png`, fullPage: true });

    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await page.screenshot({ path: `${OUT}/home-top-${vp.name}.png`, fullPage: false });
    const strip = page.locator(".lp-promo");
    if (await strip.count()) {
      for (const [i, row] of ["a", "b", "c"].entries()) {
        await page.evaluate((target) => {
          // Each row has a negative animation-delay (0 / -3s / -6s on a 9s cycle), and the
          // local time of an animation is currentTime - delay. Visible = local ~0.5s,
          // hidden = local ~4.5s, so currentTime must account for each row's own delay.
          const SHOW = { a: 500, b: 6500, c: 3500 };
          const HIDE = { a: 4500, b: 1500, c: 7500 };
          for (const anim of document.getAnimations()) {
            const el = anim.effect && anim.effect.target;
            if (!el || !el.classList || !el.classList.contains("lp-promo-row")) continue;
            const key = ["a", "b", "c"].find((k) => el.classList.contains(k));
            anim.pause();
            anim.currentTime = key === target ? SHOW[key] : HIDE[key];
          }
        }, row);
        await page.waitForTimeout(150);
        await strip.first().screenshot({ path: `${OUT}/hero-strip-${i + 1}-${vp.name}.png` });
      }
    } else {
      console.log(`no .lp-promo at ${vp.name}`);
    }
    await ctx.close();
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
