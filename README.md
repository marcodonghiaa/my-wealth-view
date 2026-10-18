# My Wealth View

A self-hosted net worth dashboard. Bank accounts, investments and crypto in one place, converted to a single currency.

![Dashboard](public/og-image.png)

- **Net Worth**: total over time (bank + portfolio + crypto), in EUR, USD or GBP
- **Transactions**: full register with inline categories and a "worth it?" check
- **Subscriptions**: recurring charges with detected billing frequency and true monthly cost; one-off charges are listed separately and left out of the estimate
- **Spending** and **Income vs Expenses**: monthly breakdowns
- **Portfolio** and **Crypto**: holdings, allocation and live-priced value

This is the frontend. The data pipeline (bank sync, FX rates, AI categorization, pricing, setup wizard) is in [myfinances](https://github.com/marcodonghiaa/myfinances). Start there to self-host.

## Look and feel

iOS-style design: system font, grouped lists, large titles, translucent bars, a bottom tab bar on phones. Light and dark themes follow the system setting (no toggle). Account numbers are masked until tapped, charts carry text alternatives, and translucency falls back to solid when the OS asks for reduced transparency.

## Stack

TanStack Start (React), Tailwind, shadcn/ui, Supabase. The app only uses the publishable key, so every read and write goes through Row Level Security (`auth.uid() = user_id`). No service-role key is used anywhere.

## Run it

Needs [Bun](https://bun.sh) and a Supabase project with the schema applied (the backend's `setup.sh` does this).

```sh
git clone https://github.com/marcodonghiaa/my-wealth-view.git
cd my-wealth-view
bun install
cp .env.example .env   # your Supabase URL + publishable key
bun run dev
```

Set your own `.env`: in a browser on a self-hosted domain the app throws rather than silently connecting to the maintainer's Supabase project.

## Import your history

Open **Import data** (a link on the Accounts page, also offered on a new empty dashboard). Pick net worth by month or spending by month, then choose a CSV: in Excel, File → Save As → CSV. The file is read in your browser and nothing is sent until you press Import.

- Amounts are read as EUR. Spending rows in another currency are skipped.
- Months can be `2024-03`, `03/2024`, `Mar 2024`, `marzo 2024` or an Excel date. Day-first dates (`03/04/2024` is 3 April) are assumed.
- Importing again overwrites months that already exist. Undo removes the rows of that import but does not bring back values it replaced.
- Examples: [`docs/examples/net-worth.csv`](docs/examples/net-worth.csv) and [`docs/examples/spending.csv`](docs/examples/spending.csv).

Needs the backend migration `20261019000000_import_support.sql` (in the `myfinances` repo). Apply it before deploying this version, otherwise the net worth chart cannot load its history.

## Deploy on Vercel

Import the repo in Vercel (framework: Other, defaults for build). Vercel sets `VERCEL=1`, which switches the Nitro preset to `vercel` in `vite.config.ts`. Add `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (and `VITE_VAPID_PUBLIC_KEY` for push) as environment variables, then add the Vercel domain under Supabase → Authentication → URL Configuration so login redirects work. Every merge to `main` deploys; every PR gets a preview URL.

## Scripts

`bun run dev` · `bun run build` · `bun run test` · `bun run lint` · `bun run format`

## License

[MIT](LICENSE)
