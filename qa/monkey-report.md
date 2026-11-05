# Monkey test report: MyFinances demo mode at phone size

Run date: 2026-11-05 · App commit: `bfd5988` (main) · Dev server: `bun run dev --port 5211 --host 127.0.0.1` · Browser: Playwright Chromium (headless)

## Summary

| # | Severity | Finding | Route |
|---|----------|---------|-------|
| 1 | Medium | Deleting one rule deletes every rule added after the list was emptied (demo) | `/rules` |
| 2 | Medium | "Try again" on the error page cannot recover from a failed route chunk | any lazy route (tested `/reports`, `/spending`) |
| 3 | Low | The Accounts headline total runs off the screen once it reaches about €10 billion | `/accounts` |
| 4 | Low | A CD with very large but finite inputs shows `€∞` and `1e+308% APY` | `/accounts` |

Only findings that replayed in a fresh browser context and that the source does not explain as intended are listed.

## What was run

- 52 seeds × 120 steps = **6,240 actions** across 4 browser setups: 375×812 light, 390×844 dark, 375×812 dark, 390×844 light. The seed picks the setup (`(seed-1) % 4`) and the start route (`(seed-1) % 13`), so each of the 13 routes was the start route for 4 seeds.
- Each seed is its own browser context. It opens `/demo` once, then moves only inside that page, using `history.pushState` + `popstate` and `history.back()`. A `load` listener flags any full reload. None happened.
- **Batch 1 (seeds 1–26, 3,120 actions)** followed the requested mix. 1,016 of its "type" steps found no visible input and did nothing, because most screens have no text field until a form is opened.
- **Batch 2 (seeds 27–52, 3,120 actions)** changes one thing: a "type" step with no visible input becomes a click. Batch 2 performed 1,920 clicks/double-clicks and 284 typing steps.
- After every action the script checked for: console errors, page errors, the error page, `scrollWidth > innerWidth`, dialogs or poppers outside the viewport (rechecked after 700 ms to ignore open animations), `NaN`/`undefined`/`Infinity`/`[object Object]`/exponent text, and clicks blocked by another element while no modal was open.
- Scripts are in `qa/monkey-tools/`. Replay a seed with `node qa/monkey-tools/monkey-batch1.cjs <seed> <steps> <outDir>` for seeds 1–26, or `monkey-batch2.cjs` for seeds 27–52, against the dev server on port 5211.

### Clean results

Across 6,240 actions there were:

- no page errors or unhandled rejections;
- no error pages and no reloads;
- no horizontal overflow;
- no dialog or popover outside the viewport.

The only console error was finding 1's duplicate-key warning.

### Flags dropped after checking

- **"Undo" in a toast blocked by `<li>`** (seeds 3, 28, 30, 31, 35). This happens when a newer sonner toast sits on top of the one with Undo. With a touch device, the first tap expands the stack and the second tap hits Undo, and the removal is undone (`qa/monkey-tools/probe-undo.cjs`). That is how sonner stacks toasts, not an app bug.
- **`NaN` / emoji text in the rules list** (seeds 6, 41). This is the monkey's own input shown back as a rule's match text.
- **No controls on `/settings`.** In demo mode the page only shows Health status (no buttons or inputs), so 0 clicks were possible there.
- **Double-clicking the rule form's submit button.** It adds the rule once (checked separately).

---

## 1. Deleting one rule deletes every rule added after the list was emptied (demo)

- **Route:** `/rules`
- **Seen at:** 390×844 dark, seed 6 step 95 (batch 1). Also seeds 11 step 59, 17 step 89, 23 step 93, 28 step 51, 48 step 44 and 50 step 54, across both viewports and themes.
- **Replay:** seeds 6, 11, 17 (batch 1) and 48, 50 (batch 2) replayed in fresh contexts and flagged at the same step. A direct repro (`qa/monkey-tools/probe-rules.cjs`) reproduced it twice.

**Repro**
1. Open `/demo` and go to `/rules` in the same tab.
2. Delete the three seeded rules (Supermercato, Netflix, Trenitalia).
3. Open "Add rule". Enter `alpha`, set type `Subscription`, then submit.
4. Enter `beta`, set type `Subscription`, then submit. The list shows both rules.
5. Tap the trash icon for **alpha** only.

**Expected:** only "alpha" is removed and "beta" stays.
**Actual:** both rules disappear and the list reads "Existing rules (0)". After step 4 the console also shows:

```
Each child in a list should have a unique "key" prop. … Check the render method of `RulesPage`.
```

**Why it's wrong (code)**
- `src/lib/demo/fake-client.ts:176-178`: `withDefaults` assigns `id = demo-new-N` only if the table's **first row** has an `id` (`const sample = this.db[table]![0]`). Once the table is empty, `sample` is `undefined`, so new rows are stored with no `id`.
- `src/routes/_authenticated/rules.tsx:359` keys each row by `rule.id`. Two id-less rules both get key `undefined`, which causes the warning.
- `rules.tsx:104` deletes with `.eq("id", id)`, and `fake-client.ts:118` implements `eq` as `r[col] === v`. With `id` undefined, `undefined === undefined` matches every id-less row, so one delete removes them all.
- `insertRow` and `withDefaults` serve every table, so `cd_holdings` uses the same code path. Only `category_rules` was tested end to end.

Screenshots:
- `monkey-shots/rules-1-two-new-rules.png`
- `monkey-shots/rules-2-after-deleting-alpha.png`
- `monkey-shots/seed6-step95-rules-key-warning.png`

---

## 2. "Try again" on the error page cannot recover from a failed route chunk

Chaos experiment. Hypothesis, stated before running: *"If a lazy route chunk fails to load, the app shows its error page and 'Try again' recovers without a full reload."*

**Result: hypothesis refuted.** The error page does appear. "Try again" never recovers, even after the network comes back. The router also does one full page reload by itself before showing the error page.

- **Route:** `/reports` (repeated on `/spending` with the same result)
- **Viewport and theme:** 375×812 light
- **Replay:** 3 runs in fresh contexts (`chaos.cjs /reports`, `chaos.cjs /spending`, `chaos2.cjs`), all the same.

**Repro** (`qa/monkey-tools/chaos.cjs`, `chaos2.cjs`)
1. Open `/demo` and wait for the dashboard.
2. Use `page.route` to abort every request for `/src/routes/_authenticated/reports.tsx?tsr-split=component`.
3. In the same page, navigate in-app to `/reports`.
4. Remove the route block.
5. Click "Try again", then click it again.
6. Navigate in-app to `/spending`, then back to `/reports`.

**Timeline from `chaos2.cjs`:**

```
1198 navigate /reports in-app
1211 req  …/reports.tsx?tsr-split=component -> ABORT
1323 load /reports                       <- full page reload by the router
1690 req  …/reports.tsx?tsr-split=component -> ABORT
3714 errorPage=true  sessionStorage has "tanstack_router_reload:Failed to fetch dynamically imported module: …"
3750 unblocked
5877 after Try again: errorPage=true     (no request for the chunk was made)
7890 in-app /spending: renders fine
9903 in-app back to /reports: errorPage=true
```

**Expected:** once the chunk is reachable again, "Try again" loads `/reports`.
**Actual:** "Try again" leaves "This page didn't load" on screen, and no new request for the chunk is made. Going to another route and back still shows the error page. Recovery after a full reload was not tested.

**Console:** repeated on each attempt:

```
Failed to load resource: net::ERR_FAILED
TypeError: Failed to fetch dynamically imported module: http://127.0.0.1:5211/src/routes/_authenticated/reports.tsx?tsr-split=component
The above error occurred in the <Lazy> component. React will try to recreate this component tree from scratch using the error boundary you provided, Cat… (truncated in capture)
```

**Why it's wrong (code):** `src/routes/__root.tsx:52-60` offers "Try again" as recovery and runs `router.invalidate(); reset();`. That re-renders the same failed lazy import and fetches nothing, so for a failed chunk the button can never work. The user sees a "Try again" button that does nothing, after an automatic reload they did not ask for.

Verified on the Vite dev server only. A production build was not tested.

Screenshots:
- `monkey-shots/chaos-1-blocked.png`
- `monkey-shots/chaos-2-after-try-again.png` (after unblocking and clicking "Try again")

---

## 3. The Accounts headline total runs off the screen once it reaches about €10 billion

- **Route:** `/accounts`
- **Viewport and theme:** 375×812 light. Not covered by the random runs, because they never completed the 4-field CD form. Found by a directed odd-input probe using the `999999999999` value from the input list.
- **Replay:** 2 fresh contexts, same result (`qa/monkey-tools/probe-cd2.cjs 999999999999 3.5 375 812 light`).

**Repro**
1. Open `/demo`, then go to `/accounts` in-app.
2. Open "Add a certificate of deposit".
3. Fill in Name `Probe CD`, Principal `999999999999`, APY `3.5` and Maturity date `2099-01-01`, then tap "Add CD".

**Expected:** the headline total fits the 375 px screen, or wraps.
**Actual:** `€1,000,000,025,402.17` is cut off at `€1,000,000,025,40`. The page becomes 448 px wide (`scrollWidth 448 > innerWidth 375`) and scrolls sideways. The element past the edge is the cents `<span>` of `HeadlineFigure`.

**Threshold:** at 375 px, a principal of 999,999,999 (total about €1.0 bn) still fits. A principal of 9,999,999,999 (total about €10 bn) already overflows (388 px).

**Console:** none.

**Why it's wrong (code):** `src/components/headline-figure.tsx` renders the amount as one unbroken string. Its `figure-display` utility (`src/styles.css:196-204`) sets a font size of at least 2.75rem (44 px), with no wrap, shrink or `overflow` handling. The only bound on the value is `principalNum > 0` (`accounts.tsx:304`). Severity is low because few users hold €10 bn, but it is the only horizontal overflow found.

Screenshots:
- `monkey-shots/cd-overflow-header.png`
- `monkey-shots/cd-overflow-scrolled-right.png`

---

## 4. A CD with very large but finite inputs shows `€∞` and `1e+308% APY`

- **Route:** `/accounts`
- **Viewport and theme:** 390×844 dark. Found by a directed odd-input probe.
- **Replay:** 2 fresh contexts, same result (`qa/monkey-tools/probe-cd2.cjs 1e308 1e308 390 844 dark`).

**Repro**
1. Open `/demo`, then go to `/accounts` in-app.
2. Open "Add a certificate of deposit".
3. Fill in Name `Probe CD`, Principal `1e308` and APY `1e308` (both are valid `type=number` values), and Maturity `2099-01-01`. Tap "Add CD".

**Expected:** validation rejects values whose result can't be shown, as it already does for non-finite input.
**Actual:** the CD is saved ("Certificate of deposit added"). Then:
- the card shows `1e+308% APY` and a value of `€∞`;
- the Accounts total shows `€∞`;
- the principal line is printed as a 300-digit number;
- the page becomes 2,552 px wide.

**Console:** none.

**Why it's wrong (code):** `handleAddCd` (`src/routes/_authenticated/accounts.tsx:298-311`) checks `Number.isFinite` on the inputs, which shows non-finite numbers are meant to be kept out. It has no upper bound, though, so finite inputs produce an infinite value. Then `(cd.annual_rate * 100).toFixed(2)` (`accounts.tsx:736`) prints exponent notation. Verified in demo mode only. The real database's column limits were not checked (no migrations in this repo).

Screenshot: `monkey-shots/cd-infinity-card.png`
