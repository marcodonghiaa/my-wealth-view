// Seeded monkey test for MyFinances demo mode.
// Usage: node monkey.cjs <seed> <steps> <outDir> [--replay]
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = "http://127.0.0.1:5211";
const ROUTES = ["/", "/transactions", "/spending", "/income", "/subscriptions", "/portfolio", "/crypto", "/accounts", "/settings", "/import", "/rules", "/reports", "/splitwise"];
const CONFIGS = [
  { w: 375, h: 812, scheme: "light" },
  { w: 390, h: 844, scheme: "dark" },
  { w: 375, h: 812, scheme: "dark" },
  { w: 390, h: 844, scheme: "light" },
];
const ODD = ["", "-1", "0", "1e309", "NaN", "999999999999", "12,50", "1.234,56", "€5", "<b>x</b>", "🧪💸🔥", "x".repeat(60) + "y".repeat(70) + "z".repeat(70), "2099-01-01"];
const BAD_TEXT = /sign out|log out|github|self-host|forgot password/i;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main() {
  const seed = Number(process.argv[2]);
  const steps = Number(process.argv[3]);
  const outDir = process.argv[4];
  const replay = process.argv.includes("--replay");
  const shotDir = path.join(outDir, "shots");
  fs.mkdirSync(shotDir, { recursive: true });
  const rng = mulberry32(seed * 7919 + 17);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const startRoute = ROUTES[(seed - 1) % ROUTES.length];
  const cfg = CONFIGS[(seed - 1) % CONFIGS.length];
  let vp = { width: cfg.w, height: cfg.h };

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: vp, colorScheme: cfg.scheme, hasTouch: true, isMobile: false });
  const page = await context.newPage();
  const log = { seed, startRoute, cfg, steps: [], flags: [] };
  let pending = []; // errors since last check
  page.on("console", (m) => { if (m.type() === "error") pending.push({ type: "console", text: m.text().slice(0, 500) }); });
  page.on("pageerror", (e) => pending.push({ type: "pageerror", text: String(e && e.stack || e).slice(0, 800) }));
  page.on("dialog", (d) => { pending.push({ type: "native-dialog", text: d.message() }); d.dismiss().catch(() => {}); });
  let loads = 0;
  page.on("load", () => { loads++; });

  await page.goto(BASE + "/demo", { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const inAppNav = async (to) => {
    await page.evaluate((to) => { history.pushState(history.state, "", to); dispatchEvent(new PopStateEvent("popstate", { state: history.state })); }, to);
  };
  if (startRoute !== "/") await inAppNav(startRoute);
  await page.waitForTimeout(800);
  const loadsAfterStart = loads;
  let depth = 0;
  pending = pending.filter(() => true);

  const seen = new Set();
  async function flag(step, type, detail) {
    const key = type + "|" + String(detail).slice(0, 120);
    if (seen.has(key)) return;
    seen.add(key);
    const shot = `seed${seed}-step${step}-${type}.png`;
    try { await page.screenshot({ path: path.join(shotDir, shot) }); } catch {}
    log.flags.push({ step, type, detail, url: page.url(), viewport: vp, scheme: cfg.scheme, shot });
  }

  async function candidates(kind) {
    return page.evaluate(({ kind, badSrc }) => {
      const bad = new RegExp(badSrc, "i");
      document.querySelectorAll("[data-mk]").forEach((e) => e.removeAttribute("data-mk"));
      const vis = (el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return false;
        const s = getComputedStyle(el);
        if (s.visibility === "hidden" || s.display === "none" || Number(s.opacity) === 0) return false;
        return !!el.offsetParent || s.position === "fixed";
      };
      // Scope to the topmost open modal layer, if any.
      const layers = [...document.querySelectorAll('[role=dialog],[role=alertdialog],[data-radix-popper-content-wrapper]')].filter(vis);
      const scope = layers.length ? layers[layers.length - 1] : document.body;
      const sel = kind === "input"
        ? 'input:not([type=file]):not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]):not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly])'
        : 'button:not([disabled]), [role=option], [role=menuitem], [role=tab], [role=switch], [role=checkbox], [role=combobox], [role=radio], a[href], summary, select, input[type=checkbox], input[type=radio]';
      const out = [];
      let n = 0;
      for (const el of scope.querySelectorAll(sel)) {
        if (!vis(el)) continue;
        if (el.closest('nav[aria-label=Primary], aside')) continue;
        if (el.closest("[role=dialog]") && el.closest("[role=dialog]").querySelector("h2")?.textContent === "Menu") continue;
        if (el.closest("nav") && !el.closest("[role=dialog]") && el.tagName === "A") continue;
        const text = (el.innerText || el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.getAttribute("name") || "").trim().slice(0, 60);
        if (bad.test(text) || bad.test(el.getAttribute("aria-label") || "")) continue;
        if (el.tagName === "A") {
          const href = el.getAttribute("href") || "";
          if (/^https?:|^mailto:|^\/\//.test(href) || el.target === "_blank") continue;
          if (bad.test(href)) continue;
        }
        el.setAttribute("data-mk", String(n));
        out.push({ id: n, tag: el.tagName.toLowerCase(), type: el.getAttribute("type") || "", role: el.getAttribute("role") || "", text, inForm: !!el.closest("form") });
        n++;
      }
      return { list: out, modal: layers.length > 0 };
    }, { kind, badSrc: BAD_TEXT.source });
  }

  async function check(step) {
    const errs = pending; pending = [];
    for (const e of errs) await flag(step, e.type, e.text);
    if (!page.url().startsWith(BASE)) { await flag(step, "left-app", page.url()); return "left"; }
    const r = await page.evaluate(() => {
      const iw = window.innerWidth, ih = window.innerHeight;
      const res = { overflow: null, errorPage: false, outside: [], badText: [], auth: location.pathname };
      const sw = document.documentElement.scrollWidth;
      if (sw > iw) {
        // find widest offender
        let worst = null;
        for (const el of document.querySelectorAll("body *")) {
          const rc = el.getBoundingClientRect();
          if (rc.right > iw + 1 && rc.width > 0) {
            const s = getComputedStyle(el);
            if (!worst || rc.right > worst.right) worst = { right: Math.round(rc.right), tag: el.tagName, cls: String(el.className).slice(0, 80), text: (el.innerText || "").slice(0, 60) };
          }
        }
        res.overflow = { sw, iw, worst };
      }
      const t = document.body.innerText || "";
      res.errorPage = t.includes("This page didn't load");
      for (const el of document.querySelectorAll('[role=dialog],[role=alertdialog],[data-radix-popper-content-wrapper],[role=listbox],[role=menu]')) {
        const rc = el.getBoundingClientRect();
        if (rc.width < 1 || rc.height < 1) continue;
        if (rc.left < -1 || rc.top < -1 || rc.right > iw + 1 || rc.bottom > ih + 1) {
          res.outside.push({ role: el.getAttribute("role") || "popper", l: Math.round(rc.left), t: Math.round(rc.top), r: Math.round(rc.right), b: Math.round(rc.bottom), iw, ih, text: (el.innerText || "").slice(0, 60) });
        }
      }
      const re = /\bNaN\b|\bundefined\b|\bInfinity\b|\[object Object\]|\d[eE][+-]\d/g;
      let m;
      while ((m = re.exec(t)) && res.badText.length < 5) res.badText.push(t.slice(Math.max(0, m.index - 50), m.index + 50).replace(/\s+/g, " "));
      return res;
    });
    if (r.errorPage) await flag(step, "error-page", page.url());
    if (r.auth === "/auth") await flag(step, "auth-screen", "landed on /auth");
    if (r.overflow) await flag(step, "h-overflow", JSON.stringify(r.overflow));
    if (r.outside.length) {
      await page.waitForTimeout(700); // rule out open animations
      const still = await page.evaluate(() => {
        const iw = window.innerWidth, ih = window.innerHeight, o = [];
        for (const el of document.querySelectorAll('[role=dialog],[role=alertdialog],[data-radix-popper-content-wrapper],[role=listbox],[role=menu]')) {
          const rc = el.getBoundingClientRect();
          if (rc.width < 1 || rc.height < 1) continue;
          if (rc.left < -1 || rc.top < -1 || rc.right > iw + 1 || rc.bottom > ih + 1) o.push({ role: el.getAttribute("role") || "popper", l: Math.round(rc.left), t: Math.round(rc.top), r: Math.round(rc.right), b: Math.round(rc.bottom), iw, ih, text: (el.innerText || "").slice(0, 60) });
        }
        return o;
      });
      for (const o of still) await flag(step, "layer-outside-viewport", JSON.stringify(o));
    }
    for (const b of r.badText) await flag(step, "bad-text", b);
    if (loads > loadsAfterStart) await flag(step, "full-reload", page.url());
    return "ok";
  }

  const t0 = Date.now();
  for (let i = 1; i <= steps; i++) {
    let roll = rng();
    let action = "", detail = "";
    try {
      if (roll < 0.4 && (await candidates("input")).list.length === 0) roll = 0.5; // no input: click instead
      if (roll < 0.4) {
        const { list } = await candidates("input");
        const value = pick(ODD);
        const submit = rng() < 0.5;
        if (!list.length) { action = "type-none"; }
        else {
          const c = pick(list);
          action = "type"; detail = `${c.tag}[${c.type}] "${c.text}" <= ${JSON.stringify(value.slice(0, 30))}${submit ? " +submit" : ""}`;
          const loc = page.locator(`[data-mk="${c.id}"]`);
          if (["date", "month", "time", "datetime-local"].includes(c.type)) {
            await loc.fill(value === "2099-01-01" || value === "" ? value : "2099-01-01", { timeout: 1500 }).catch(() => {});
          } else {
            await loc.click({ timeout: 1500 });
            await page.keyboard.press("Control+A");
            await page.keyboard.press("Backspace");
            if (value.length > 40) await page.keyboard.insertText(value); else if (value) await page.keyboard.type(value);
          }
          if (submit) {
            if (c.inForm) {
              const sub = await loc.evaluate((el) => { const f = el.closest("form"); const b = f && f.querySelector('button[type=submit],button:not([type])'); if (b && !b.disabled) { b.setAttribute("data-mk-sub", "1"); return true; } return false; });
              if (sub) await page.locator('[data-mk-sub="1"]').click({ timeout: 1500 }).catch(() => {});
              else await page.keyboard.press("Enter");
              await page.evaluate(() => document.querySelectorAll("[data-mk-sub]").forEach((e) => e.removeAttribute("data-mk-sub")));
            } else await page.keyboard.press("Enter");
          }
        }
      } else if (roll < 0.8) {
        const { list, modal } = await candidates("click");
        if (!list.length) { action = "click-none"; }
        else {
          const c = pick(list);
          const dbl = rng() < 0.1;
          action = dbl ? "dblclick" : "click"; detail = `${c.tag}${c.role ? "[" + c.role + "]" : ""} "${c.text}"`;
          const loc = page.locator(`[data-mk="${c.id}"]`);
          try {
            if (c.tag === "select") {
              const opts = await loc.evaluate((el) => [...el.options].map((o) => o.value));
              const v = pick(opts); detail += ` => ${JSON.stringify(v)}`;
              await loc.selectOption(v, { timeout: 1500 });
            } else if (dbl) await loc.dblclick({ timeout: 1500 }); else await loc.click({ timeout: 1500 });
          } catch (e) {
            const msg = String(e.message || e);
            detail += " !! " + msg.split("\n").find((l) => /intercept|outside|not visible|not stable|detached/.test(l))?.trim()?.slice(0, 160);
            if (!modal && /intercepts pointer events/.test(msg)) {
              const by = (msg.match(/<[^>]+> (?:from <[^>]+> subtree )?intercepts pointer events/) || [""])[0];
              log.steps.push({ i, action, detail, url: page.url() });
              await flag(i, "unreachable", `${detail.split(" !! ")[0]} blocked by ${by}`.slice(0, 300));
              continue;
            }
          }
        }
      } else {
        const r2 = rng();
        if (r2 < 0.25) { action = "escape"; await page.keyboard.press("Escape"); }
        else if (r2 < 0.5) { const dy = Math.floor(rng() * 1600) - 600; action = "scroll"; detail = String(dy); await page.mouse.wheel(0, dy); }
        else if (r2 < 0.65) {
          if (depth > 0) { action = "back"; await page.goBack({ timeout: 3000 }).catch(() => {}); depth--; }
          else action = "back-skip";
        }
        else if (r2 < 0.9) { const to = pick(ROUTES); action = "route"; detail = to; await inAppNav(to); depth++; }
        else { vp = vp.width === 375 ? { width: 390, height: 844 } : { width: 375, height: 812 }; action = "viewport"; detail = `${vp.width}x${vp.height}`; await page.setViewportSize(vp); }
      }
    } catch (e) {
      detail += " !! " + String(e.message || e).split("\n")[0].slice(0, 160);
    }
    await page.waitForTimeout(350);
    log.steps.push({ i, action, detail, url: page.url().replace(BASE, "") });
    const st = await check(i).catch((e) => { log.steps.push({ i, action: "check-failed", detail: String(e).slice(0, 200) }); return "ok"; });
    if (st === "left") break;
  }
  log.ms = Date.now() - t0;
  fs.writeFileSync(path.join(outDir, `seed${seed}${replay ? "-replay" : ""}.json`), JSON.stringify(log, null, 1));
  console.log(`seed ${seed} ${startRoute} ${cfg.w}x${cfg.h} ${cfg.scheme}: ${log.steps.length} steps, ${log.flags.length} flags, ${Math.round(log.ms / 1000)}s`);
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
