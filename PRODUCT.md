# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Self-hosters: technical people who run their own copy of MyFinances to see all their wealth in one place. They mostly use it on a laptop, with the phone as a secondary way to check in. Their job is to know where their money stands (net worth, spending, holdings) without handing bank data to a third-party app.

## Product Purpose

A self-hosted net worth dashboard. It brings together bank accounts (synced through Enable Banking), investments and crypto, all converted to one currency (EUR, USD or GBP). Success means the user opens it, gets a trustworthy picture of their finances at a glance, and can drill into transactions, spending, subscriptions, income and holdings.

## Positioning

- Self-hosted and open source.
- The data lives in the user's own Supabase project; the publisher never sees it.
- Bank access is read-only, and the app moves no money.
- It is not financial or investment advice.

## Operating Context

- Each user deploys their own frontend (Vercel or Docker) and backend: Supabase with RLS, sync on GitHub Actions, Gemini categorization, FX and price feeds.
- Sign-in is email + password, with no in-app sign-up.
- `/demo` runs on generated fake data in the browser.
- The app is an installable PWA with Web Push alerts.

## Capabilities and Constraints

- Screens:
  - Net Worth (overview)
  - Reports
  - Accounts
  - Transactions, with inline categories and a "worth it?" check
  - Income vs Expenses
  - Spending
  - Subscriptions
  - Splitwise
  - Portfolio
  - Crypto
  - Import
  - Rules
- Stack: TanStack Start (React 19), Tailwind v4 tokens in `src/styles.css`, shadcn/ui, Recharts, Supabase (publishable key only), Vitest.
- Setup, import, onboarding flows and config are out of scope for visual work. Another workstream is testing them.
- Light and dark themes follow the system setting.
- Account numbers are masked until tapped.
- Undecided: a privacy policy page and an in-app "not financial advice" disclaimer don't exist yet.

## Brand Commitments

- Name: MyFinances.
- Mark: three rising mint bars on a forest tile (`src/components/brand-mark.tsx`, `public/icon-*.png`).
- Colours: Forest `#173F34`, Mint `#D8ECDD`, Ivory `#F7F5EE`.
- The user asked for a Revolut / Trade Republic direction for the app UI.

## Evidence on Hand

- Demo data generator (`src/lib/demo/`).
- Screenshots in `docs/screenshots/`.
- There are no testimonials, customers, user counts or certifications. Don't invent any.

## Product Principles

1. Trust is earned through transparency: say where the data lives and what the app can't do.
2. Show the number first, then explain it.
3. The app is read-only and never pushes the user to act on money.
4. A self-hoster's time is scarce: every screen should answer its question at a glance.

## Accessibility & Inclusion

WCAG 2.2 AA: contrast, keyboard navigation, text alternatives for charts. Respect reduced motion and reduced transparency.
