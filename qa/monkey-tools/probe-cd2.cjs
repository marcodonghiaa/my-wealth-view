const { chromium } = require("playwright");
const BASE = "http://127.0.0.1:5211";
const nav = (p, to) => p.evaluate((to) => { history.pushState(history.state, "", to); dispatchEvent(new PopStateEvent("popstate")); }, to);
const [principal, rate, w, h, scheme, shot] = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: +w, height: +h }, colorScheme: scheme, deviceScaleFactor: 2 })).newPage();
  const logs = []; page.on("console", (m) => m.type() === "error" && logs.push(m.text().slice(0, 140)));
  await page.goto(BASE + "/demo", { waitUntil: "networkidle" });
  await nav(page, "/accounts"); await page.waitForTimeout(1200);
  await page.locator('button[aria-expanded]').filter({ hasText: /CD|deposit/i }).first().click(); await page.waitForTimeout(300);
  await page.getByPlaceholder("e.g. House deposit CD").fill("Probe CD");
  await page.getByPlaceholder("10000").click(); await page.keyboard.type(principal);
  await page.getByPlaceholder("3.5").click(); await page.keyboard.type(rate);
  await page.locator('input[type=date]').nth(1).fill("2099-01-01");
  await page.locator('form button[type=submit]').last().click(); await page.waitForTimeout(1200);
  const r = await page.evaluate(() => {
    const iw = innerWidth; const off = [];
    for (const el of document.querySelectorAll("main *")) { const rc = el.getBoundingClientRect(); if (rc.right > iw + 1 && el.children.length === 0) off.push({ tag: el.tagName, right: Math.round(rc.right), text: (el.innerText || el.tagName).slice(0, 60), cls: String(el.className).slice(0, 70) }); }
    return { sw: document.documentElement.scrollWidth, iw, off: off.slice(0, 6) };
  });
  console.log(JSON.stringify(r, null, 1));
  if (shot) {
    await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(300); await page.screenshot({ path: shot + "-header.png" });
    await page.evaluate(() => scrollTo(10000, 0)); await page.waitForTimeout(300); await page.screenshot({ path: shot + "-scrolled-right.png" });
    await page.evaluate(() => scrollTo(0, 0)); const el = page.locator("h3", { hasText: "Probe CD" }).first(); await el.scrollIntoViewIfNeeded(); await page.evaluate(() => scrollBy(0, 150)); await page.waitForTimeout(300); await page.screenshot({ path: shot + "-card.png" });
  }
  console.log(logs); await browser.close();
})();
