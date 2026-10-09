const { createRequire } = require("module");
const req = createRequire("/home/user/GEO-Tool/package.json");
let pw; try { pw = req("playwright"); } catch { pw = req("@playwright/test"); }
const BASE = "http://localhost:3112", OUT = "/tmp/claude-0/ev-fix";
(async () => {
  const b = await pw.chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
  const report = [];
  for (const [n, w, h] of [["390", 390, 844], ["1280", 1280, 900]]) {
    const c = await b.newContext({ viewport: { width: w, height: h }, reducedMotion: "reduce" });
    const p = await c.newPage();
    await p.route("**/*", (r) => (r.request().url().startsWith(BASE) ? r.continue() : r.abort()));
    await p.goto(BASE + "/", { waitUntil: "load" });
    await p.waitForTimeout(1500);
    const info = await p.evaluate(() => {
      const secs = [...document.querySelectorAll("main > section, section")].map((s) => ({ cls: s.className.toString().slice(0, 40), top: Math.round(s.getBoundingClientRect().top + scrollY), h: Math.round(s.getBoundingClientRect().height) }));
      const faq = document.querySelector(".lp-faq-sec"); const prev = faq.previousElementSibling;
      const html = document.documentElement.outerHTML;
      return { sections: secs.map((s) => s.cls.split(" ").slice(0, 2).join(".")), prevClass: prev.className, gapPrevToFaq: Math.round(faq.getBoundingClientRect().top - prev.getBoundingClientRect().bottom),
        prevBg: getComputedStyle(prev).backgroundColor, faqBg: getComputedStyle(faq).backgroundColor,
        testimonialInDom: /Nerea|Nordika|128\s?%|lp-testi/i.test(html), docOverflowPx: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    await p.evaluate(() => { const f = document.querySelector(".lp-faq-sec"); window.scrollTo(0, f.getBoundingClientRect().top + scrollY - 300); });
    await p.waitForTimeout(600);
    await p.screenshot({ path: `${OUT}/seam-prod-to-faq-${n}.png` });
    await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await p.waitForTimeout(600);
    await p.screenshot({ path: `${OUT}/footer-${n}.png` });
    report.push({ viewport: n, ...info });
    await c.close();
  }
  require("fs").writeFileSync(`${OUT}/dom-report.json`, JSON.stringify(report, null, 2));
  await b.close();
})();
