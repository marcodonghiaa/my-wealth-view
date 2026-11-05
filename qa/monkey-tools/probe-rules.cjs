const { chromium } = require("playwright");
const BASE = "http://127.0.0.1:5211";
const nav = (p, to) => p.evaluate((to) => { history.pushState(history.state, "", to); dispatchEvent(new PopStateEvent("popstate")); }, to);
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "light", deviceScaleFactor: 2 })).newPage();
  const logs = []; page.on("console", (m) => m.type() === "error" && logs.push(m.text().slice(0, 140)));
  await page.goto(BASE + "/demo", { waitUntil: "networkidle" });
  await nav(page, "/rules"); await page.waitForTimeout(1200);
  const list = () => page.locator("ul.divide-y li p").allInnerTexts();
  console.log("start", await list());
  while (await page.locator('button[aria-label^="Delete rule for"]').count()) {
    await page.locator('button[aria-label^="Delete rule for"]').first().click(); await page.waitForTimeout(500);
  }
  console.log("after deleting all", await list());
  for (const t of ["alpha", "beta"]) {
    if (!(await page.getByPlaceholder("e.g. spotify").isVisible())) { await page.getByRole("button", { name: "Add rule" }).first().click(); await page.waitForTimeout(400); }
    await page.getByPlaceholder("e.g. spotify").fill(t);
    // choose a type: click the "Transfer" type button
    await page.getByRole("button", { name: "—", exact: true }).last().click(); await page.waitForTimeout(300);
    await page.locator("[data-radix-popper-content-wrapper] button", { hasText: "Subscription" }).first().click(); await page.waitForTimeout(200);
    await page.locator('form button[type=submit]').click(); await page.waitForTimeout(700);
  }
  console.log("after adding 2", await list());
  await page.screenshot({ path: "final/rules-1-two-new-rules.png" });
  await page.locator('button[aria-label="Delete rule for alpha"]').click(); await page.waitForTimeout(800);
  console.log("after deleting alpha only", await list());
  await page.screenshot({ path: "final/rules-2-after-deleting-alpha.png" });
  console.log(logs);
  await browser.close();
})();
