// Renders each preview HTML (no network: every non-file request is aborted) to a PNG at email width.
const { createRequire } = require("module");
const req = createRequire("/home/user/GEO-Tool/package.json");
let pw; try { pw = req("playwright"); } catch { pw = req("@playwright/test"); }
const fs = require("fs"), path = require("path");
const DIR = __dirname;
(async () => {
  const browser = await pw.chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
  for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith(".html"))) {
    const ctx = await browser.newContext({ viewport: { width: 640, height: 900 } });
    const page = await ctx.newPage();
    await page.route("**/*", (r) => (r.request().url().startsWith("file://") ? r.continue() : r.abort()));
    await page.goto("file://" + path.join(DIR, f));
    await page.screenshot({ path: path.join(DIR, f.replace(/\.html$/, ".png")), fullPage: true });
    await ctx.close();
  }
  await browser.close();
})();
