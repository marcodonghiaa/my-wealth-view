# My Wealth View

Build a personal finance dashboard called "Finance Dashboard". Connect to my existing Supabase project (org "Marcoo", project ref diwezyrtlwdbrsgegkay) via the Supabase connector — do not provision a new Lovable Cloud database.

This app must require Supabase Auth login (email/password) before any data is shown — there is no public/unauthenticated view. All data access must go through the authenticated Supabase client using the anon key, respecting existing Row Level Security policies (never use a service-role key in this app).

First screen: Net Worth
- Query the view `v_net_worth_daily` (columns: snapshot_date, total_eur) and plot it as a line chart over time
- Show the most recent total_eur as a large headline number, labeled in EUR
- Add a currency toggle (EUR / USD / GBP) near the headline: on toggle, fetch the latest row per currency from the `fx_rates` table (columns: date, currency, rate_to_eur) and convert the headline number by dividing total_eur by the target currency's rate_to_eur. The line chart can stay in EUR.

Design: clean, modern, dark-mode-friendly financial dashboard aesthetic (this is a portfolio piece, so polish matters). Leave room in the layout/navigation for future screens (spend by category, income vs expenses, portfolio holdings) but only build the Net Worth screen for now.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/00c8edfa-0a83-4d45-870f-4d24bffe450a).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
