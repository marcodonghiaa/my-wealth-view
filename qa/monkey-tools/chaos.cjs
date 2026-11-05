// Chaos: block one lazy route chunk, navigate, unblock, click "Try again".
const { chromium } = require("playwright");
const BASE = "http://127.0.0.1:5211";
const route = process.argv[2] || "/reports";
const file = route.slice(1) + ".tsx";
const shotDir = process.argv[3] || ".";
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, colorScheme: "light" });
  const page = await ctx.newPage();
  const logs = [];
  page.on("console", (m) => m.type() === "error" && logs.push("console: " + m.text().slice(0, 300)));
  page.on("pageerror", (e) => logs.push("pageerror: " + String(e).slice(0, 300)));
  let loads = 0; page.on("load", () => loads++);
  const chunkReqs = [];
  page.on("request", (r) => { if (r.url().includes(file)) chunkReqs.push(r.url().replace(BASE, "")); });
  await page.goto(BASE + "/demo", { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const loadsBefore = loads;
  const pattern = (u) => u.pathname.endsWith("/" + file) && u.search.includes("tsr-split");
  let aborted = [];
  await page.route(pattern, (r) => { aborted.push(r.request().url().replace(BASE, "")); r.abort("failed"); });
  await page.evaluate((to) => { history.pushState(history.state, "", to); dispatchEvent(new PopStateEvent("popstate")); }, route);
  await page.waitForTimeout(2500);
  const t1 = await page.evaluate(() => document.body.innerText);
  const errorShown = t1.includes("This page didn't load");
  await page.screenshot({ path: `${shotDir}/chaos-1-blocked.png` });
  await page.unroute(pattern);
  const reqsBeforeRetry = chunkReqs.length;
  if (errorShown) await page.getByRole("button", { name: "Try again" }).click();
  await page.waitForTimeout(3000);
  const t2 = await page.evaluate(() => document.body.innerText);
  await page.screenshot({ path: `${shotDir}/chaos-2-after-try-again.png` });
  const h1 = await page.locator("h1").allInnerTexts();
  // Second try
  let t3 = null;
  if (t2.includes("This page didn't load")) {
    await page.getByRole("button", { name: "Try again" }).click();
    await page.waitForTimeout(3000);
    t3 = (await page.evaluate(() => document.body.innerText)).slice(0, 120);
  }
  console.log(JSON.stringify({
    route, url: page.url(), aborted, errorShown,
    afterTryAgainStillError: t2.includes("This page didn't load"),
    afterTryAgainText: t2.slice(0, 200), h1,
    chunkRequestsAfterUnblock: chunkReqs.slice(reqsBeforeRetry),
    secondTry: t3,
    fullReloads: loads - loadsBefore, logs,
  }, null, 1));
  await browser.close();
})();
