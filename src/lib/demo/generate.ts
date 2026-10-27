import {
  DAY_MS,
  DEMO_USER_ID,
  DEMO_WINDOW_DAYS,
  MAIN,
  SAVINGS,
  between,
  hash,
  iso,
  monthStart,
  pick,
  price,
  rngFor,
  round2,
  stamp,
  sum,
  type DemoDb,
} from "./helpers";
import { dailyTransactions, monthlyTransactions, signedEur } from "./bank-activity";
import { deriveViews } from "./views";

// Fake data for the public demo. A pure function of the calendar day: same day, same numbers; a
// new day slides the 90-day window forward by one day. Every table and view of the database
// must have a key here (the DemoDb type enforces it), so a new table breaks the build until it
// gets demo data.

export { DEMO_EXEMPT_TABLES, DEMO_USER_ID, DEMO_WINDOW_DAYS, type DemoDb } from "./helpers";

// ---------- the whole database ----------

const HOLDINGS = [
  {
    isin: "IE00DEMO0001",
    name: "Global Equity ETF",
    yahoo: "DGEQ.DE",
    type: "ETF",
    shares: 42,
    base: 118,
    currency: "EUR",
  },
  {
    isin: "IE00DEMO0002",
    name: "Euro Government Bond ETF",
    yahoo: "DEGB.DE",
    type: "Bond",
    shares: 30,
    base: 112,
    currency: "EUR",
  },
  {
    isin: "IE00DEMO0003",
    name: "Tech Innovators ETF",
    yahoo: "DTEC.DE",
    type: "ETF",
    shares: 60,
    base: 64,
    currency: "EUR",
  },
  {
    isin: "US00DEMO0004",
    name: "Demo Computing Inc.",
    yahoo: "DMCI",
    type: "Stock",
    shares: 10,
    base: 225,
    currency: "USD",
  },
] as const;
const BOND_ISINS = new Set<string>(HOLDINGS.filter((h) => h.type === "Bond").map((h) => h.isin));

const COINS = [
  { symbol: "BTC", id: "bitcoin", name: "Bitcoin", amount: 0.05, base: 62000 },
  { symbol: "ETH", id: "ethereum", name: "Ethereum", amount: 1.2, base: 2600 },
  { symbol: "SOL", id: "solana", name: "Solana", amount: 8, base: 150 },
] as const;

const SPLIT_EXPENSES: ReadonlyArray<readonly [string, string]> = [
  ["Weekend groceries", "Groceries"],
  ["Electricity bill", "Housing"],
  ["Dinner out", "Dine Out"],
  ["Movie night", "Entertainment"],
];

const usdRate = (n: number) => round2(0.92 + 0.02 * Math.sin(n / 11));
const gbpRate = (n: number) => round2(1.16 + 0.015 * Math.sin(n / 13 + 1));

export function generateDemoData(now: Date = new Date()): DemoDb {
  const todayNum = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / DAY_MS);
  const days = Array.from(
    { length: DEMO_WINDOW_DAYS },
    (_, i) => todayNum - (DEMO_WINDOW_DAYS - 1) + i,
  );
  const today = iso(todayNum);
  const user_id = DEMO_USER_ID;

  const transactions = days
    .flatMap((n) => [...monthlyTransactions(n), ...dailyTransactions(n, todayNum)])
    .sort(
      (a, b) =>
        b.booking_date!.localeCompare(a.booking_date!) ||
        a.entry_reference.localeCompare(b.entry_reference),
    );

  // Bank balances: the main account is walked back from today's balance through its own transactions.
  const MAIN_TODAY = 4850;
  const mainSigned = (n: number) =>
    sum(
      transactions.filter((t) => t.account_uid === MAIN && t.booking_date! > iso(n)).map(signedEur),
    );
  // Savings are fed only by the monthly transfer out of the current account.
  const SAVINGS_TODAY = 12400;
  const transferredAfter = (n: number) =>
    sum(
      transactions
        .filter((t) => t.flow_type === "transfer" && t.booking_date! > iso(n))
        .map((t) => t.amount),
    );
  const balances = days.flatMap((n) => [
    { uid: MAIN, amount: round2(MAIN_TODAY - mainSigned(n)), n },
    { uid: SAVINGS, amount: round2(SAVINGS_TODAY - transferredAfter(n)), n },
  ]);
  const net_worth_snapshots: DemoDb["net_worth_snapshots"] = balances.map((b, id) => ({
    account_uid: b.uid,
    amount: b.amount,
    created_at: stamp(iso(b.n)),
    currency: "EUR",
    eur_equivalent: b.amount,
    id,
    snapshot_date: iso(b.n),
    user_id,
  }));

  const accounts: DemoDb["accounts"] = [
    { uid: MAIN, label: "Demo Bank Current", iban: "IT00DEMO0000000000000001", currency: "EUR" },
    { uid: SAVINGS, label: "Demo Bank Savings", iban: "IT00DEMO0000000000000002", currency: "EUR" },
  ].map((a) => ({
    ...a,
    // No bank fields: the two demo accounts keep grouping by label, as before bank_name existed.
    bank_country: null,
    bank_logo: null,
    bank_name: null,
    consent_valid_until: `${iso(todayNum + 80)}T00:00:00Z`,
    created_at: stamp(iso(days[0]!)),
    identification_hash: null,
    user_id,
  }));

  const v_bank_accounts_latest: DemoDb["v_bank_accounts_latest"] = accounts.map((a) => ({
    amount: balances.find((b) => b.uid === a.uid && b.n === todayNum)!.amount,
    amount_eur: balances.find((b) => b.uid === a.uid && b.n === todayNum)!.amount,
    bank_country: a.bank_country,
    bank_logo: a.bank_logo,
    bank_name: a.bank_name,
    consent_valid_until: a.consent_valid_until,
    currency: "EUR",
    iban: a.iban,
    label: a.label,
    snapshot_date: today,
    uid: a.uid,
    user_id,
  }));

  const portfolio_holdings: DemoDb["portfolio_holdings"] = HOLDINGS.map((h) => ({
    asset_type: h.type,
    broker_label: "Demo Broker",
    created_at: stamp(iso(days[0]!)),
    isin: h.isin,
    name: h.name,
    shares: h.shares,
    user_id,
    yahoo_symbol: h.yahoo,
  }));
  const portfolio_snapshots: DemoDb["portfolio_snapshots"] = days.flatMap((n) =>
    HOLDINGS.map((h) => {
      const p = price(h.base, h.isin, n);
      const native = round2(p * h.shares);
      return {
        created_at: stamp(iso(n)),
        currency: h.currency,
        isin: h.isin,
        price: p,
        snapshot_date: iso(n),
        user_id,
        value_eur: round2(h.currency === "USD" ? native * usdRate(n) : native),
        value_native: native,
      };
    }),
  );

  const crypto_holdings: DemoDb["crypto_holdings"] = COINS.map((c) => ({
    amount: c.amount,
    asset_symbol: c.symbol,
    coingecko_id: c.id,
    created_at: stamp(iso(days[0]!)),
    name: c.name,
    source: "demo-wallet",
    user_id,
  }));
  const crypto_snapshots: DemoDb["crypto_snapshots"] = days.flatMap((n) =>
    COINS.map((c) => {
      const p = price(c.base, c.symbol, n);
      const usd = round2(p * c.amount);
      return {
        amount: c.amount,
        asset_symbol: c.symbol,
        created_at: stamp(iso(n)),
        price_usd: p,
        snapshot_date: iso(n),
        source: "demo-wallet",
        user_id,
        value_eur: round2(usd * usdRate(n)),
        value_usd: usd,
      };
    }),
  );

  const v_net_worth_daily: DemoDb["v_net_worth_daily"] = days.map((n) => {
    const d = iso(n);
    const bank = sum(
      net_worth_snapshots.filter((s) => s.snapshot_date === d).map((s) => s.eur_equivalent!),
    );
    const held = portfolio_snapshots.filter((s) => s.snapshot_date === d);
    const port = sum(held.map((s) => s.value_eur!));
    const bonds = sum(held.filter((s) => BOND_ISINS.has(s.isin)).map((s) => s.value_eur!));
    const crypto = sum(
      crypto_snapshots.filter((s) => s.snapshot_date === d).map((s) => s.value_eur!),
    );
    return {
      bank_total_eur: round2(bank),
      crypto_total_eur: round2(crypto),
      portfolio_bonds_eur: round2(bonds),
      portfolio_total_eur: round2(port),
      snapshot_date: d,
      total_eur: round2(bank + port + crypto),
      user_id,
    };
  });

  // Month-start points from a year ago up to the live window, so the chart has no hole.
  // Imported history first, the last two months "rebuilt from statements". Each asset class
  // climbs towards where the live series starts, at its own pace and with its own wobble.
  const monthsBack = (k: number) =>
    iso(Math.floor(Date.UTC(now.getFullYear(), now.getMonth() - k, 1) / DAY_MS));
  const start = v_net_worth_daily[0]!;
  const pastMonths = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1].filter(
    (k) => monthsBack(k) < start.snapshot_date!,
  );
  const wobble = (k: number, key: string, size: number) =>
    size * (rngFor(`nw|${k}|${key}`)() - 0.5) * (1.2 - (1 - (k - 1) / 12));
  const pastRow = (k: number) => {
    const t = 1 - (k - 1) / 12;
    return {
      date: monthsBack(k),
      stocks: round2(start.portfolio_total_eur! * 0.8 * (0.8 + 0.18 * t + wobble(k, "s", 0.05))),
      bonds: round2(start.portfolio_total_eur! * 0.2 * (0.9 + 0.08 * t + wobble(k, "b", 0.01))),
      crypto: round2(start.crypto_total_eur! * (0.6 + 0.35 * t + wobble(k, "c", 0.3))),
      cash: round2(start.bank_total_eur! * (0.88 + 0.1 * t + wobble(k, "$", 0.04))),
    };
  };
  const rebuiltFrom = pastMonths.length - 2;
  const net_worth_history: DemoDb["net_worth_history"] = pastMonths
    .slice(0, rebuiltFrom)
    .map((k) => {
      const r = pastRow(k);
      return {
        batch_id: "demo-history",
        bonds_eur: r.bonds,
        cash_eur: r.cash,
        created_at: stamp(r.date),
        crypto_eur: r.crypto,
        liabilities_eur: 0,
        other_eur: 0,
        snapshot_date: r.date,
        stocks_eur: r.stocks,
        total_eur: round2(r.stocks + r.bonds + r.crypto + r.cash),
        user_id,
      };
    });
  const net_worth_reconstructed: DemoDb["net_worth_reconstructed"] = pastMonths
    .slice(rebuiltFrom)
    .map((k) => {
      const r = pastRow(k);
      return {
        bonds_eur: r.bonds,
        cash_eur: r.cash,
        created_at: stamp(r.date),
        crypto_eur: r.crypto,
        snapshot_date: r.date,
        source: "demo",
        stocks_eur: r.stocks,
        user_id,
      };
    });

  const fx_rates: DemoDb["fx_rates"] = days.flatMap((n) => [
    { created_at: stamp(iso(n)), currency: "USD", date: iso(n), rate_to_eur: usdRate(n) },
    { created_at: stamp(iso(n)), currency: "GBP", date: iso(n), rate_to_eur: gbpRate(n) },
  ]);

  const cd = [
    {
      id: "demo-cd-1",
      label: "12-month deposit",
      principal: 5000,
      rate: 0.032,
      start: -180,
      end: 185,
    },
    {
      id: "demo-cd-2",
      label: "Matured deposit",
      principal: 3000,
      rate: 0.025,
      start: -430,
      end: -65,
    },
  ];
  const cd_holdings: DemoDb["cd_holdings"] = cd.map((c) => ({
    annual_rate: c.rate,
    bank_label: "Demo Bank",
    created_at: stamp(iso(todayNum + c.start)),
    currency: "EUR",
    id: c.id,
    label: c.label,
    maturity_date: iso(todayNum + c.end),
    principal: c.principal,
    start_date: iso(todayNum + c.start),
    user_id,
  }));

  const swGroups = ["Casa", "Viaggio Lisbona"];
  const splitwise_expenses: DemoDb["splitwise_expenses"] = days
    .filter((n) => hash(`sw|${iso(n)}`) % 9 === 0)
    .map((n, i) => {
      const r = rngFor(`sw|${iso(n)}`);
      const expense = pick(r, SPLIT_EXPENSES);
      return {
        amount: between(r, 8, 60),
        batch_id: "demo-batch",
        booking_date: iso(n),
        category: expense[1],
        created_at: stamp(iso(n)),
        currency: "EUR",
        description: expense[0],
        fingerprint: `demo-${iso(n)}`,
        group_name: swGroups[i % 2]!,
        id: `sw-${iso(n)}`,
        linked_account_uid: null,
        linked_entry_reference: null,
        user_id,
      };
    });
  const balanceRows = (group: string, people: Array<[string, number, boolean]>) =>
    people.map(([person, balance, is_me]) => ({
      balance,
      currency: "EUR",
      group_name: group,
      is_me,
      person,
      updated_at: stamp(today),
      user_id,
    }));
  const splitwise_balances: DemoDb["splitwise_balances"] = [
    ...balanceRows("Casa", [
      ["Demo User", 45.5, true],
      ["Giulia", -30.5, false],
      ["Luca", -15, false],
    ]),
    ...balanceRows("Viaggio Lisbona", [
      ["Demo User", -22, true],
      ["Giulia", 22, false],
    ]),
  ];

  const category_rules: DemoDb["category_rules"] = [
    {
      id: "demo-rule-1",
      match_field: "creditor_name",
      match_text: "Supermercato",
      set_category: "Groceries",
      set_transaction_type: null,
      priority: 10,
    },
    {
      id: "demo-rule-2",
      match_field: "creditor_name",
      match_text: "Netflix",
      set_category: "Entertainment",
      set_transaction_type: "Subscription",
      priority: 20,
    },
    {
      id: "demo-rule-3",
      match_field: "creditor_name",
      match_text: "Trenitalia",
      set_category: "Transports",
      set_transaction_type: null,
      priority: 30,
    },
  ].map((r) => ({ ...r, created_at: stamp(iso(days[0]!)), user_id }));

  const db: DemoDb = {
    accounts,
    category_rules,
    cd_holdings,
    crypto_holdings,
    crypto_snapshots,
    fx_rates,
    net_worth_history,
    // Imported monthly totals from before the live window.
    spend_history: [6, 5, 4].flatMap((k) =>
      [
        ["Groceries", 310],
        ["Dine Out", 190],
        ["Transports", 95],
        ["Housing", 750],
      ].map(([category, base]) => ({
        batch_id: "demo-history",
        category: category as string,
        created_at: stamp(monthsBack(k)),
        month: monthsBack(k),
        spend_eur: round2((base as number) * (0.9 + 0.2 * rngFor(`hist|${k}|${category}`)())),
        user_id,
      })),
    ),
    net_worth_snapshots,
    pending_bank_consents: [],
    portfolio_holdings,
    portfolio_snapshots,
    push_subscriptions: [],
    net_worth_reconstructed,
    splitwise_balances,
    splitwise_expenses,
    subscription_billing_overrides: [
      {
        billing_frequency: "Monthly",
        created_at: stamp(iso(days[0]!)),
        creditor_name: "Gym Demo",
        custom_interval_unit: null,
        custom_interval_value: null,
        dismissed: false,
        user_id,
      },
    ],
    transactions,
    v_bank_accounts_latest,
    v_cd_holdings: [],
    v_crypto_latest: [],
    v_spend_by_category_monthly: [],
    v_income_vs_expenses_monthly: [],
    v_net_worth_daily,
    v_net_worth_eur: net_worth_snapshots.map((s) => ({
      account_uid: s.account_uid,
      amount: s.amount,
      amount_eur: s.eur_equivalent,
      currency: s.currency,
      snapshot_date: s.snapshot_date,
      user_id,
    })),
    v_portfolio_latest: [],
    v_splitwise_eur: [],
    v_subscriptions: [],
    v_transactions_eur: [],
  };
  return { ...db, ...deriveViews(db, todayNum) };
}
