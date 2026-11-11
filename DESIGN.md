---
name: Alopex
description: A self-hosted net worth app where the number is the interface.
colors:
  ground: "oklch(0.985 0.003 230)"
  surface: "oklch(1 0 0)"
  ink: "oklch(0.17 0.012 240)"
  ink-muted: "oklch(0.48 0.012 240)"
  fill: "oklch(0.955 0.004 230)"
  ember: "oklch(0.68 0.16 50)"
  ember-soft: "oklch(0.68 0.16 50 / 12%)"
  highlight: "oklch(0.68 0.16 50 / 22%)"
  hairline: "oklch(0.17 0.012 240 / 10%)"
  rule: "oklch(0.17 0.012 240 / 18%)"
  gain: "oklch(0.52 0.12 160)"
  loss: "oklch(0.55 0.2 18)"
  warning: "oklch(0.68 0.16 50)"
  category-1: "oklch(0.30 0.03 240)"
  category-2: "oklch(0.42 0.04 240)"
  category-3: "oklch(0.54 0.05 240)"
  category-4: "oklch(0.66 0.05 240)"
  category-5: "oklch(0.78 0.04 240)"
  dark-ground: "oklch(0.15 0.008 240)"
  dark-surface: "oklch(0.19 0.008 240)"
  dark-sheet: "oklch(0.22 0.008 240)"
  dark-ink: "oklch(0.95 0.006 230)"
  dark-ink-muted: "oklch(0.70 0.01 230)"
  dark-fill: "oklch(0.23 0.008 240)"
  dark-ember: "oklch(0.74 0.15 50)"
  dark-gain: "oklch(0.76 0.13 160)"
  dark-loss: "oklch(0.72 0.17 20)"
typography:
  display:
    fontFamily: "Fragment Mono, ui-monospace, SF Mono, Menlo, monospace"
    fontSize: "clamp(2.5rem, 1.5rem + 2.8vw, 3.75rem)"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "-0.04em"
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
    fontFamily: "Fragment Mono, ui-monospace, SF Mono, Menlo, monospace"
    fontSize: "0.9375rem"
    fontWeight: 400
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
  eyebrow:
    fontFamily: "Fragment Mono, ui-monospace, SF Mono, Menlo, monospace"
    fontSize: "0.6875rem"
    letterSpacing: "0.08em"
    textTransform: "uppercase"
  tab:
    fontFamily: "Geist Variable, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 500
rounded:
  control: "4px"
  container: "8px"
  sheet: "12px"
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
    rounded: "{rounded.control}"
    padding: "4px"
  segmented-control-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    height: "36px"
  focus-ring:
    outline: "2px solid {colors.ember}"
    offset: "2px"
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
    height: "44px"
  button-quiet:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "36px"
  month-step:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    size: "44px"
  search-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "44px"
    padding: "0 16px 0 40px"
  form-field:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  grouped-list:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.container}"
  list-row:
    textColor: "{colors.ink}"
    padding: "12px 16px"
  avatar:
    backgroundColor: "{colors.fill}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    size: "40px"
  nav-item-active:
    backgroundColor: "{colors.fill}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  alert-error:
    textColor: "{colors.loss}"
    rounded: "{rounded.container}"
    padding: "12px 16px"
---

# Design System: Alopex

## Overview

**Creative North Star: "Arctic Ledger"**

Alopex reads like a well-made bank app: one exact figure at the top of the screen, quiet rows beneath, and nothing else competing. The world is played straight in the Revolut / Trade Republic register the user pinned: a snow ground, white grouped lists floating on it with no outlines, every amount set in Fragment Mono and every word in Geist, cold ink as the one control tint and Ember (fox fur) as the single accent. Colour carries meaning (gain, loss, warning) or rank (a category, by lightness), never decoration.

Density is calm rather than sparse. Rows are generous (40px avatar, 64px breakdown rows, 44px minimum tap targets), sections breathe at 32px, and the page column caps at 64rem so the figure and its chart stay in one glance on a 1440 screen. The interface is read-only in tone: no trading cues, no hype, no tinted stat tiles in boxed cards.

The tinted ground with white grouped lists was approved by the user after seeing it. Import, onboarding and setup surfaces are out of scope for this system and keep their older styling; do not treat them as reference.

**Key Characteristics:**
- One headline figure per screen that has one agreed total, in Fragment Mono 400; symbol and cents at full size, symbol muted, cents at 55%.
- Pale ground, white grouped lists, hairline dividers, no borders or drop shadows on containers.
- Cold ink is the only control tint (white on dark); Ember is the only accent: focus ring, live cursor, counts.
- Figures are mono, words are sans; a mono eyebrow (`01 OVERVIEW`) indexes sections.
- Green and red mean gain and loss, and nothing else.
- 4px corners on controls, 8px on containers. No pills.
- The outline fox appears only in empty states: never beside an amount, never in a chart, one per viewport.
- Light and dark follow the system setting; both are first-class.

## Colors

A cold neutral world: snow ground, cold ink for controls, one warm Ember accent, meaning-only status hues, categories as one hue ranked by lightness.

### Primary
- **Ink** (cold, oklch(0.17 0.012 240)): the one control tint. Selected segment, primary buttons, the active tab, the net worth line, caret. In dark mode the role passes to white.
- **Ember** (fox fur, oklch(0.68 0.16 50); oklch(0.74 0.15 50) on dark): the single accent. Focus ring, the chart's live cursor, counts and badges, links, the loading rule. Never a fill behind text; **Ember Soft** (12%) is its only wash.
- **Highlight** (Ember at 22%): text selection.

### Neutral
- **Ground** (light) / **Dark Ground** (near-black): the page and sidebar background.
- **Surface** (white) / **Dark Surface**: grouped lists, fields that sit on the ground, quiet buttons, month steps. Dark Sheet is one step higher for popovers and sheets.
- **Ink** / **Dark Ink**: primary text and figures. **Ink Muted**: page names, secondary lines, cents, axis ticks, legend percentages.
- **Fill** / **Dark Fill**: the segmented-control track, neutral avatar wash, skeletons, active sidebar item. **Fill Hover**: row and button hover.
- **Hairline** (ink at 10%, white at 10% on dark): every divider and the default border colour. **Rule** (18%): form field outlines.

### Status
- **Gain** / **Dark Gain**: positive changes only.
- **Loss** / **Dark Loss**: negative changes, error alerts (on a 10% wash), and destructive actions (delete, sign out). Destructive shares the loss value.
- **Warning** / **Dark Warning**: stale-data and attention notes.

### Categorical
- **Category 1 to 5** (chart-1 to chart-5): one cold hue (240), low chroma, ordered by lightness. Rank 1 is the darkest (largest share) and the ramp inverts on dark. Coins use the same ramp.
- Identity comes from rank and label, never from a distinct hue, so a category can never read as a price move.
- **Exception, pending a new palette (owner, 2026-11-09):** spending categories, their avatars and pills, and crypto coins keep their own distinct colours (`CATEGORY_COLORS` in `src/lib/categories.ts`, `src/lib/crypto-colors.ts`), like the asset-allocation donut (`--alloc-*`). A better-tuned categorical palette will replace the hex values; do not flatten them to the lightness ramp.

### Named Rules
**The One Tint Rule.** Ink is the only colour a control may wear (white on dark). Ember is the only accent, and it is a line, a dot or a count, never a filled control.

**The Meaning-Only Rule.** Green and red appear only for a gain, a loss, or a destructive action. Going over a budget counts as a loss, so an overspent budget is red. A positive number that is not a change stays in ink.

**The One Hue Rule.** Categories differ by lightness, not hue. No rainbow legends.

## Typography

**Figures:** Fragment Mono 400 (`font-figure`, `figure-display`, `eyebrow`): every amount, percent, date tick, count and section index.
**Text:** Geist Variable (`font-sans`): every word.

**Character:** A ledger. Money is set in a monospace so columns align by construction and a figure is recognisable as a figure before it is read; words sit in a warm grotesk beside it. Tight negative tracking (-0.04em) on the display size keeps the mono from feeling like code.

### Hierarchy
- **Display** (mono 400, clamp 40px to 60px, line-height 1, -0.04em): the headline figure only. Symbol, whole units and cents at one size; symbol muted, cents at 55% opacity.
- **Delta** (mono 13px): the change line under the figure, in gain or loss, with its range label in sans muted.
- **Headline** (sans 600, 32px, 1.15, -0.03em): the large title on list screens without one agreed total (Transactions, Reports, Splitwise, Rules, and Income above its month switcher). 24px in the mobile menu sheet.
- **Title** (600, 20px, -0.02em): the month name in the month switcher.
- **Section** (600, 18px): section headings above grouped lists (Breakdown).
- **Body** (400 or 500, 15px): row names, nav items, change lines. 14px for secondary copy.
- **Figure** (mono 400, 15px, -0.02em): amounts on the right of a row. Secondary figures (percent of total, legend percentages) drop to 12-14px in muted ink.
- **Label** (500, 13px, 1.25): grouped-list section titles and segment labels. Sentence case, muted.
- **Caption** (400, 12px): trust note, FX rate line, sidebar group names (500).
- **Eyebrow** (mono 11px, 0.08em, uppercase, muted): section indices and small labels ("01 OVERVIEW").
- **Tab** (500, 11px): mobile tab bar labels under 24px icons.

### Named Rules
**The Mono Figure Rule.** Every number is set in Fragment Mono; every word in Geist. Never set an amount in the sans, never a sentence in the mono.

**The Quiet Page Name Rule.** On screens that open on a figure, the page name is the h1 set small (15px, 500, muted) so the figure is the loudest thing. Labels stay sentence case; the eyebrow is the one uppercase style.

## Layout

A single centered column, max 64rem, padded 16px on mobile and 32px from 640px, with 32px top padding (48px from 768px). Sections stack at 32px (24px between the figure block and the chart).

Two openings, chosen by what the screen knows:
- **Figure opening.** Screens with one agreed total (Net Worth, Portfolio, Crypto, Subscriptions, Accounts, Spending) open on the headline figure: small muted page name with any controls on the right, then the figure, then a coloured change line and plain inline context (Today, Month, YTD). Spending puts the month switcher above the figure; Income keeps its large title, then the month switcher, then the figure.
- **Title opening.** List screens without one agreed total (Transactions, Reports, Splitwise, Rules) open on the large title or the month switcher, with their figures as quiet rows.

Desktop (768px and up): a fixed 256px sidebar on the ground colour with a hairline right edge. Mobile: a translucent 44px top bar naming the app, a 52px bottom tab bar of four routes plus More, both padded for safe areas. More opens a bottom sheet of the full nav as grouped lists. Wide tables (transactions, crypto) switch to grouped-list rows below 768px.

## Elevation & Depth

Flat by tone, not by shadow. Depth comes from the ground-to-surface step: white lists on the pale ground in light mode, a raised neutral grey on near-black in dark mode, one more step for sheets and popovers. Bars over scrolling content use a glass material (sidebar colour at 72% with 24px blur and 180% saturation), falling back to solid when the user asks for reduced transparency.

### Shadow Vocabulary
- **Floating toolbar** (`box-shadow: 0 8px 24px -12px oklch(0 0 0 / 0.25)`): only for the sticky bulk-selection bar on Transactions, which floats over the rows it acts on.

### Named Rules
**The No-Outline Rule.** Containers have no border and no drop shadow. A grouped list is a white fill on the ground; rows inside it are split by hairlines.

## Shapes

Two radii, both small: 4px on controls (segments, buttons, fields, selects, sidebar items, chips, skeleton blocks) and 8px on containers (grouped lists, alerts, sheets at 12px). Avatars and legend dots are the only circles. No pills. Hairlines, not fills, draw the edges.

## Components

### Segmented Control
Same-surface choice (currency, chart range). A 4px-radius Fill track with 2px padding; one Ink thumb slides under the selected option (300ms, cubic-bezier(0.32, 0.72, 0, 1), none under reduced motion). Segments are 36px tall, 13px 500; selected text takes the primary foreground, the rest are muted and darken on hover. Arrow keys move the selection.

### Buttons
- **Primary:** Ink, 4px corners, white 14px 500 text, 44px tall, 16px horizontal padding; hover drops to 90% opacity, disabled to 50%.
- **Quiet:** Surface, 4px corners, ink 12px 500 text, 36px tall (Load more); hover to Fill Hover.
- **Destructive text:** Loss-coloured text on no fill, 10% loss wash on hover.
- **Focus:** a 2px Ember outline, offset 2px, for every custom control.

### Headline Figure
The screen's one amount in the display style (`HeadlineFigure`): symbol muted, whole units in ink, cents at 55% opacity, all one size. The optional delta line underneath is mono 13px in gain or loss with its range label in sans muted.

### Empty State
`EmptyState({ title, hint, action? })`: a 48px outline fox (the brand path, `stroke="currentColor"` 2px, muted), a 15px 500 sans title, a 14px muted hint, an optional action. Used where a list has nothing to show (Transactions, Subscriptions, Portfolio). The fox never sits beside an amount or inside a chart, and a viewport shows at most one.

### Loading
Skeleton blocks in Fill at the control radius. Buttons show a spinner in place of their icon.

### Grouped Lists and Rows
White (Surface) fill, 8px corners, hairline dividers, clipped. Rows are 16px by 12px with a 40px round avatar on the left, name (15px 500) over a muted secondary line (13px), and the amount right-aligned in the figure style. Section titles sit above the list in the label style, inset 16px.

### Merchant Avatar
A 40px circle with the merchant's initial (15px 600, ink) on a 22% wash of the category colour mixed into the surface. Neutral rows (Breakdown) use a Fill circle with an 18px line icon.

### Month Switcher
The month as a 20px 600 heading, announced politely when it changes, with two 44px round Surface step buttons on the right. Next disables at the current month.

### Share Bar
How a total splits: one 10px bar of lightness-ranked segments with 2px gaps, and a wrapped legend underneath (8px dot, label in ink, percent in muted figures). Exposed to assistive tech as one image with a text summary.

### Charts
The net worth chart is a single 2px Ink line over a fading Ink area, no grid, no y-axis, muted 11px date ticks. Scrubbing rewrites the headline figure and change line to the hovered day; leaving restores today. Chart entry animation is off. Every chart carries a text summary as its accessible name.

### Inputs
- **Search and filters:** 44px Surface fields, 4px corners, on the ground, 16px text, Ember ring on focus.
- **Form fields:** 4px corners, Rule outline, ground fill inside a white form card, Ember ring on focus.

### Navigation
Sidebar items are 4px-radius, 15px, muted with an 18px line icon; hover and active take the sidebar accent fill (ink at 6%) and ink text, active adds weight 500. The mobile tab bar uses 24px icons over 11px labels; the active tab takes the control tint. The sidebar footer carries the Trust Note (12px muted, lock icon) and sign out.

### Alerts
Errors are a 10% loss wash with loss text, 8px corners, 12px by 16px padding, role alert.

## Do's and Don'ts

### Do:
- **Do** open every screen with one agreed total on the Headline Figure, and list screens on the large title or the month switcher.
- **Do** keep Ink (white on dark) as the only control tint.
- **Do** set every amount in Fragment Mono, right-aligned in rows, and every word in Geist.
- **Do** separate rows with hairlines inside white grouped lists on the pale ground.
- **Do** use 4px corners on controls and 8px on containers.
- **Do** keep Ember to lines, dots and counts: focus ring, live cursor, badges.
- **Do** give every chart a text summary and keep 44px tap targets.
- **Do** honour reduced motion and reduced transparency.

### Don't:
- **Don't** put borders or drop shadows on cards or lists; the floating selection bar is the only shadow.
- **Don't** use green or red for anything but gains, losses and destructive actions.
- **Don't** give categories distinct hues; they differ by lightness only.
- **Don't** draw pills, and don't fill a control with Ember.
- **Don't** put the fox next to an amount or inside a chart; one fox per viewport.
- **Don't** build dashboards of tinted stat tiles in boxed cards.
- **Don't** add buy/sell cues, tickers or anything that reads as advice.
- **Don't** turn chart draw-in animation back on.
- **Don't** restyle import, onboarding or setup from this system without a decision to bring them in scope.
