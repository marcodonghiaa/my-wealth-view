---
name: MyFinances
description: A self-hosted net worth app where the number is the interface.
colors:
  forest: "oklch(0.33 0.05 167)"
  mint: "oklch(0.925 0.03 155)"
  ground: "oklch(0.977 0.003 165)"
  surface: "oklch(1 0 0)"
  ink: "oklch(0.19 0.012 165)"
  ink-muted: "oklch(0.47 0.012 165)"
  fill: "oklch(0.945 0.005 165)"
  fill-hover: "oklch(0.955 0.006 165)"
  hairline: "oklch(0.19 0.012 165 / 10%)"
  field-stroke: "oklch(0.19 0.012 165 / 16%)"
  gain: "oklch(0.5 0.13 155)"
  loss: "oklch(0.53 0.2 27)"
  warning: "oklch(0.55 0.13 65)"
  series-teal: "oklch(0.55 0.07 200)"
  series-blue: "oklch(0.55 0.15 250)"
  series-amber: "oklch(0.74 0.14 75)"
  series-violet: "oklch(0.55 0.17 310)"
  series-clay: "oklch(0.62 0.07 60)"
  dark-ground: "oklch(0.155 0.006 170)"
  dark-surface: "oklch(0.2 0.007 170)"
  dark-sheet: "oklch(0.235 0.008 170)"
  dark-ink: "oklch(0.965 0.004 165)"
  dark-ink-muted: "oklch(0.72 0.01 165)"
  dark-fill: "oklch(0.245 0.008 170)"
  dark-forest-ink: "oklch(0.3 0.05 167)"
  dark-gain: "oklch(0.8 0.15 155)"
  dark-loss: "oklch(0.72 0.18 25)"
  dark-warning: "oklch(0.82 0.14 75)"
typography:
  display:
    fontFamily: "Geist Variable, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: "clamp(2.75rem, 1.6rem + 3.2vw, 4rem)"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.035em"
    fontFeature: "tnum, lnum"
  headline:
    fontFamily: "Geist Variable, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: "2rem"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Geist Variable, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    letterSpacing: "-0.02em"
  section:
    fontFamily: "Geist Variable, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
  body:
    fontFamily: "Geist Variable, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    fontFeature: "tnum"
  figure:
    fontFamily: "Geist Variable, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 600
    letterSpacing: "-0.02em"
    fontFeature: "tnum, lnum"
  label:
    fontFamily: "Geist Variable, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.25
  caption:
    fontFamily: "Geist Variable, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
  tab:
    fontFamily: "Geist Variable, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 500
rounded:
  md: "12px"
  lg: "14px"
  xl: "18px"
  2xl: "22px"
  sheet: "26px"
  full: "9999px"
spacing:
  row-x: "16px"
  row-y: "12px"
  section: "32px"
  page-x-mobile: "16px"
  page-x: "32px"
  page-y: "32px"
  page-y-desktop: "48px"
  tap: "44px"
components:
  segmented-control:
    backgroundColor: "{colors.fill}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.full}"
    padding: "4px"
  segmented-control-selected:
    backgroundColor: "{colors.forest}"
    textColor: "{colors.surface}"
    rounded: "{rounded.full}"
    height: "36px"
  button-primary:
    backgroundColor: "{colors.forest}"
    textColor: "{colors.surface}"
    rounded: "{rounded.full}"
    padding: "8px 16px"
    height: "44px"
  button-quiet:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    padding: "0 16px"
    height: "36px"
  month-step:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    size: "44px"
  search-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    height: "44px"
    padding: "0 16px 0 40px"
  form-field:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "8px 12px"
  grouped-list:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.2xl}"
  list-row:
    textColor: "{colors.ink}"
    padding: "12px 16px"
  avatar:
    backgroundColor: "{colors.fill}"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    size: "40px"
  nav-item-active:
    backgroundColor: "{colors.fill}"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    padding: "8px 12px"
  alert-error:
    textColor: "{colors.loss}"
    rounded: "{rounded.2xl}"
    padding: "12px 16px"
---

# Design System: MyFinances

## Overview

**Creative North Star: "The Number Is the Interface"**

MyFinances reads like a well-made bank app: one exact figure at the top of the screen, quiet rows beneath, and nothing else competing. The world is played straight in the Revolut / Trade Republic register the user pinned: a pale green-grey ground, white grouped lists floating on it with no outlines, Geist with tabular figures everywhere, and a single forest tint for controls. Colour carries meaning (gain, loss, warning) or identity (a category, a coin), never decoration.

Density is calm rather than sparse. Rows are generous (40px avatar, 64px breakdown rows, 44px minimum tap targets), sections breathe at 32px, and the page column caps at 64rem so the figure and its chart stay in one glance on a 1440 screen. The interface is read-only in tone: no trading cues, no hype, no tinted stat tiles in boxed cards.

The tinted ground with white grouped lists was approved by the user after seeing it. Import, onboarding and setup surfaces are out of scope for this system and keep their older styling; do not treat them as reference.

**Key Characteristics:**
- One headline figure per screen that has one agreed total, cents set half-size and muted.
- Pale ground, white grouped lists, hairline dividers, no borders or drop shadows on containers.
- Forest is the only control tint in light mode; mint takes that role in dark mode.
- Green and red mean gain and loss, and nothing else.
- Fully rounded pills for every control; 22px corners for grouped lists.
- Light and dark follow the system setting; both are first-class.

## Colors

A near-neutral green-grey world with one forest accent and meaning-only status hues.

### Primary
- **Forest** (brand #173F34): the one control tint. Selected segment thumb, primary buttons, the active mobile tab, the net worth chart line and its fading area fill (16% to 0%), focus ring (at 50%), caret colour. In dark mode the role passes to Mint, with Forest Ink (dark-forest-ink) set on it.
- **Mint** (brand #D8ECDD): text selection in both themes (with forest text), and the primary control tint on dark. Also the bars of the brand mark.

### Neutral
- **Ground** (light) / **Dark Ground** (forest-black): the page and sidebar background.
- **Surface** (white) / **Dark Surface**: grouped lists, fields that sit on the ground, quiet buttons, month steps. Dark Sheet is one step higher for popovers and sheets.
- **Ink** / **Dark Ink**: primary text and figures. **Ink Muted**: page names, secondary lines, cents, axis ticks, legend percentages.
- **Fill** / **Dark Fill**: the segmented-control track, neutral avatar wash, skeletons, active sidebar item. **Fill Hover**: row and button hover.
- **Hairline** (ink at 10%, white at 10% on dark): every divider and the default border colour. **Field Stroke** (16%): form field outlines.

### Status
- **Gain** / **Dark Gain**: positive changes only.
- **Loss** / **Dark Loss**: negative changes, error alerts (on a 10% wash), and destructive actions (delete, sign out). Destructive shares the loss value.
- **Warning** / **Dark Warning**: stale-data and attention notes.

### Categorical
- **Series Teal, Blue, Amber, Violet, Clay** (chart-1 to chart-5) for chart series, with lighter dark-mode counterparts in the stylesheet.
- Category colours (fixed hex per spending category, shared by avatars, chips, the share bar and spending rows) and coin colours (BTC orange, ETH purple, then a fixed rotation) live in code, not tokens, so a category reads the same in both themes.

### Named Rules
**The One Tint Rule.** Forest is the only colour a control may wear (mint on dark). No second accent, no blue links, no coloured secondary buttons.

**The Meaning-Only Rule.** Green and red appear only for a gain, a loss, or a destructive action. A positive number that is not a change stays in ink.

**The Identity, Not Mood Rule.** Categorical tints are allowed for identity (a category avatar wash at 22%, a chip, a chart series, a share-bar segment) but never use the gain-green or loss-red hues, so a category never reads as a price move.

## Typography

**Display Font:** Geist Variable (with -apple-system, BlinkMacSystemFont, system-ui)
**Body Font:** Geist Variable
**Mono:** ui-monospace, SF Mono, Menlo (code only)

**Character:** One neo-grotesk family doing everything, with tabular lining figures set on the body so every column of money aligns. Tight negative tracking on the large sizes gives the figure its bank-app density.

### Hierarchy
- **Display** (600, clamp 44px to 64px, line-height 1, -0.035em): the headline figure only. Whole units at full size, the decimal part at 0.5em, weight 500, muted.
- **Headline** (600, 32px, 1.15, -0.03em): the large title on list screens without one agreed total (Transactions, Reports, Splitwise, Rules, and Income above its month switcher). 24px in the mobile menu sheet.
- **Title** (600, 20px, -0.02em): the month name in the month switcher.
- **Section** (600, 18px): section headings above grouped lists (Breakdown).
- **Body** (400 or 500, 15px): row names, nav items, change lines. 14px for secondary copy.
- **Figure** (600, 15px, -0.02em, tabular lining): amounts on the right of a row. Secondary figures (percent of total, legend percentages) drop to 12-14px in muted ink.
- **Label** (500, 13px, 1.25): grouped-list section titles and segment labels. Sentence case, muted.
- **Caption** (400, 12px): trust note, FX rate line, sidebar group names (500).
- **Tab** (500, 11px): mobile tab bar labels under 24px icons.

### Named Rules
**The Tabular Rule.** Every number is set in tabular lining figures. Never let a column of amounts shift as values change or a chart is scrubbed.

**The Quiet Page Name Rule.** On screens that open on a figure, the page name is the h1 set small (15px, 500, muted) so the figure is the loudest thing. Labels stay sentence case; no uppercase tracked labels above headings.

## Layout

A single centered column, max 64rem, padded 16px on mobile and 32px from 640px, with 32px top padding (48px from 768px). Sections stack at 32px (24px between the figure block and the chart).

Two openings, chosen by what the screen knows:
- **Figure opening.** Screens with one agreed total (Net Worth, Portfolio, Crypto, Subscriptions, Accounts, Spending) open on the headline figure: small muted page name with any pills on the right, then the figure, then a coloured change line and plain inline context (Today, Month, YTD). Spending puts the month switcher above the figure; Income keeps its large title, then the month switcher, then the figure.
- **Title opening.** List screens without one agreed total (Transactions, Reports, Splitwise, Rules) open on the large title or the month switcher, with their figures as quiet rows.

Desktop (768px and up): a fixed 256px sidebar on the ground colour with a hairline right edge. Mobile: a translucent 44px top bar naming the app, a 52px bottom tab bar of four routes plus More, both padded for safe areas. More opens a bottom sheet of the full nav as grouped lists. Wide tables (transactions, crypto) switch to grouped-list rows below 768px.

## Elevation & Depth

Flat by tone, not by shadow. Depth comes from the ground-to-surface step: white lists on the pale ground in light mode, a raised forest-grey on forest-black in dark mode, one more step for sheets and popovers. Bars over scrolling content use a glass material (sidebar colour at 72% with 24px blur and 180% saturation), falling back to solid when the user asks for reduced transparency.

### Shadow Vocabulary
- **Floating toolbar** (`box-shadow: 0 8px 24px -12px oklch(0 0 0 / 0.25)`): only for the sticky bulk-selection bar on Transactions, which floats over the rows it acts on.

### Named Rules
**The No-Outline Rule.** Containers have no border and no drop shadow. A grouped list is a white fill on the ground; rows inside it are split by hairlines.

## Shapes

Two radii carry the system. Controls are fully rounded pills: segments, buttons, search, selects, sidebar items, avatars, month steps, category chips, the share bar. Containers are softly rounded at 22px: grouped lists, alerts, skeleton blocks. Form fields inside a card use 14px; the mobile sheet top uses 26px. The brand mark repeats the language: a rounded tile with fully rounded bars. Native selects draw their own chevron 12px in from the pill edge.

## Components

### Segmented Control (pills)
Same-surface choice (currency, chart range). A fully rounded Fill track with 4px padding; one Forest thumb slides under the selected option (300ms, cubic-bezier(0.32, 0.72, 0, 1), none under reduced motion). Segments are 36px tall, 13px 500; selected text takes the primary foreground, the rest are muted and darken on hover. Arrow keys move the selection.

### Buttons
- **Primary:** Forest pill, white 14px 500 text, 44px tall, 16px horizontal padding; hover drops to 90% opacity, disabled to 50%.
- **Quiet:** Surface pill, ink 12px 500 text, 36px tall (Load more); hover to Fill Hover.
- **Destructive text:** Loss-coloured text on no fill, 10% loss wash on hover.
- **Focus:** a 2px outline in the ring colour, offset 2px, for every custom control.

### Headline Figure
The screen's one amount, in the display style, formatted with two decimals; the decimal part is half-size, 500, muted. Followed by the change line in gain or loss with its range in muted text.

### Grouped Lists and Rows
White (Surface) fill, 22px corners, hairline dividers, clipped. Rows are 16px by 12px with a 40px round avatar on the left, name (15px 500) over a muted secondary line (13px), and the amount right-aligned in the figure style. Section titles sit above the list in the label style, inset 16px.

### Merchant Avatar
A 40px circle with the merchant's initial (15px 600, ink) on a 22% wash of the category colour mixed into the surface. Neutral rows (Breakdown) use a Fill circle with an 18px line icon.

### Month Switcher
The month as a 20px 600 heading, announced politely when it changes, with two 44px round Surface step buttons on the right. Next disables at the current month.

### Share Bar
How a total splits: one 10px fully rounded bar of categorical segments with 2px gaps, and a wrapped legend underneath (8px dot, label in ink, percent in muted figures). Exposed to assistive tech as one image with a text summary.

### Charts
The net worth chart is a single 2px Forest line over a fading Forest area, no grid, no y-axis, muted 11px date ticks. Scrubbing rewrites the headline figure and change line to the hovered day; leaving restores today. Chart entry animation is off. Every chart carries a text summary as its accessible name.

### Inputs
- **Search and filters:** 44px Surface pills on the ground, 16px text, 2px ring on focus.
- **Form fields:** 14px corners, Field Stroke outline, ground fill inside a white form card, 2px ring on focus.

### Navigation
Sidebar items are fully rounded, 15px, muted with an 18px line icon; hover and active take the sidebar accent fill (ink at 6%) and ink text, active adds weight 500. The mobile tab bar uses 24px icons over 11px labels; the active tab takes the control tint. The sidebar footer carries the Trust Note (12px muted, lock icon) and sign out.

### Alerts
Errors are a 10% loss wash with loss text, 22px corners, 12px by 16px padding, role alert.

## Do's and Don'ts

### Do:
- **Do** open every screen with one agreed total on the Headline Figure, and list screens on the large title or the month switcher.
- **Do** keep Forest (mint on dark) as the only control tint.
- **Do** set every amount in tabular lining figures, right-aligned in rows.
- **Do** separate rows with hairlines inside white grouped lists on the pale ground.
- **Do** use fully rounded pills for controls and 22px corners for containers.
- **Do** give every chart a text summary and keep 44px tap targets.
- **Do** honour reduced motion and reduced transparency.

### Don't:
- **Don't** put borders or drop shadows on cards or lists; the floating selection bar is the only shadow.
- **Don't** use green or red for anything but gains, losses and destructive actions.
- **Don't** give a category or coin a colour in the gain-green or loss-red hue range.
- **Don't** build dashboards of tinted stat tiles in boxed cards.
- **Don't** add buy/sell cues, tickers or anything that reads as advice.
- **Don't** turn chart draw-in animation back on.
- **Don't** restyle import, onboarding or setup from this system without a decision to bring them in scope.
