---
version: 1
slug: "src-routes-authenticated-index-tsx"
primary_target: "src/routes/_authenticated/index.tsx"
related_targets: ["src/routes/_authenticated/transactions.tsx","src/routes/_authenticated/portfolio.tsx","src/routes/_authenticated/route.tsx"]
---

## Scope

- App shell (sidebar, mobile bars) and shared tokens.
- Deep rework of three screens: Net Worth (`/`), Transactions, Portfolio. The other screens inherit the system.
- Mode: Operate.
- Out of scope: setup, import, onboarding and config.

## Audience and task

- Users are self-hosters, desktop-first with the phone secondary.
- First question the screen must answer: what is my net worth and how did it move?
- After that, they scan activity and holdings.
- Constraints:
  - No trading cues: no buy/sell, no tickers or hype, nothing that reads as advice.
  - Light and dark themes both stay.
  - WCAG 2.2 AA.

## Direction contract

THESIS: The number is the interface. Every screen that has one agreed total opens on it (Net Worth, Portfolio, Crypto, Subscriptions, Income), with quiet rows beneath. Screens with one agreed total open on it: Net Worth, Portfolio, Crypto, Subscriptions, Income, Accounts (bank + deposits) and Spending (month header, then "Spent" and the figure). Transactions, Reports, Splitwise and Rules have no single agreed total. They open on a large title or the month, with their figures as quiet rows. This refuses the dashboard of tinted stat tiles inside boxed cards.

OWN-WORLD:
- Light: pale ground (#F6F7F6) with white grouped lists; forest-black ink `#0E1512`; one accent, forest `#173F34`, for active pills and primary buttons. Mint `#D8ECDD` is the only control tint.
- Dark: `#0B0F0E` ground; the active pill is mint with forest text.
- Geist with tabular figures throughout.
- Pills are fully rounded.
- Hairline rows, with a round 40px initial avatar on the left and the amount on the right.
- Categorical tints (category avatars and chips, chart series) are allowed for identity, the Revolut way. They never use the gain-green or loss-red hues.
- The user approved the tinted ground with white grouped lists in their own words after seeing it: "seems good so far" (2026-10-27).
- No card borders or drop shadows. Gains and losses keep their green and red, used for meaning only.

STORY: The visitor reads their net worth in one glance and sees how it moved over the chosen range. Scrubbing the chart shows any past day. Then they move to transactions or holdings.

FIRST VIEWPORT:
- Top left: page name, small and muted. Currency pills on the right.
- The balance at 64px, weight 600, with the cents smaller and muted.
- Below it, the change over the selected range with its amount and percent, coloured. Next to that, Today, Month and YTD as plain inline text.
- A full-width single-line area chart with no grid and no y-axis. Range pills sit under the chart.
- The breakdown (Bank / Portfolio / Crypto) as rows below.

FORM: canon. The category standard is played straight, with Revolut and Trade Republic as the craft bar. The user pinned this. Position: standing exit. The user pinned the direction (Revolut / Trade Republic). No roll informed it.

Signature interaction: scrubbing the chart rewrites the hero balance and change line to the hovered date. Leaving the chart restores today's values.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

- No privacy policy page exists yet. The trust line only states facts.
