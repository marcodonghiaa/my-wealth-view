const { chromium } = require("playwright");
const BASE = "http://127.0.0.1:5211";
const nav = (p, to) => p.evaluate((to) => { history.pushState(history.state, "", to); dispatchEvent(new PopStateEvent("popstate")); }, to);
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true })).newPage();
  await page.goto(BASE + "/demo", { waitUntil: "networkidle" });
  await nav(page, "/subscriptions"); await page.waitForTimeout(1200);
  const rm = page.locator('button[aria-label^="Remove "]');
  const first = await rm.first().getAttribute("aria-label");
  await rm.first().tap(); await page.waitForTimeout(400);
  await rm.first().tap(); await page.waitForTimeout(600);
  const toasts = page.locator("[data-sonner-toast]");
  console.log("toasts", await toasts.allInnerTexts());
  const undo = toasts.filter({ hasText: first.replace("Remove ", "") }).getByRole("button", { name: "Undo" });
  const box = await undo.boundingBox();
  // Tap where the back toast's Undo is; then tap again after the stack expands.
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2); await page.waitForTimeout(500);
  const box2 = await undo.boundingBox();
  await page.touchscreen.tap(box2.x + box2.width / 2, box2.y + box2.height / 2); await page.waitForTimeout(800);
  console.log("first removed:", first, "still removed?", !(await page.locator(`button[aria-label="${first}"]`).count()));
  await browser.close();
})();
