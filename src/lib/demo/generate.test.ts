import { describe, expect, it } from "vitest";
import { formatISODate } from "@/lib/date";
import { DEMO_EXEMPT_TABLES, DEMO_USER_ID, generateDemoData } from "./generate";

const NOON = new Date(2026, 9, 19, 12, 0, 0);
const DAY_MS = 86_400_000;

const dayOffset = (iso: string, today: Date) =>
  Math.round(
    (new Date(`${formatISODate(today)}T00:00:00`).getTime() -
      new Date(`${iso}T00:00:00`).getTime()) /
      DAY_MS,
  );

describe("generateDemoData: coverage", () => {
  const db = generateDemoData(NOON);

  it("fills every table and view, except the documented infrastructure ones", () => {
    const empty = Object.entries(db)
      .filter(([, rows]) => rows.length === 0)
      .map(([name]) => name)
      .sort();
    expect(empty).toEqual([...DEMO_EXEMPT_TABLES].sort());
  });

  it("covers every transaction flow the screens filter on", () => {
    const flows = new Set(db.transactions.map((t) => t.flow_type));
    for (const f of ["spend", "income", "refunded", "transfer"]) expect(flows).toContain(f);
  });

  it("has recurring charges, split bills and worth-it answers", () => {
    expect(db.v_subscriptions.some((s) => (s.charge_count ?? 0) >= 2)).toBe(true);
    expect(db.transactions.some((t) => t.owed_by)).toBe(true);
    const answers = new Set(db.transactions.map((t) => t.worth_it));
    expect(answers).toContain("yes");
    expect(answers).toContain("no");
  });
});

describe("generateDemoData: rolling 90-day window", () => {
  it("keeps all transactions inside the last 90 days, never in the future", () => {
    const { transactions } = generateDemoData(NOON);
    const offsets = transactions.map((t) => dayOffset(t.booking_date!, NOON));
    expect(Math.min(...offsets)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...offsets)).toBeLessThanOrEqual(89);
    expect(Math.max(...offsets)).toBeGreaterThanOrEqual(80);
  });

  it.each([
    new Date(2026, 9, 19, 0, 0, 1),
    new Date(2026, 9, 19, 23, 59, 59),
    new Date(2031, 2, 5, 9),
  ])("latest transaction is today or yesterday (%s)", (today) => {
    const { transactions } = generateDemoData(today);
    const latest = Math.min(...transactions.map((t) => dayOffset(t.booking_date!, today)));
    expect(latest).toBeLessThanOrEqual(1);
    expect(latest).toBeGreaterThanOrEqual(0);
  });

  it("ends the daily net worth series today", () => {
    const { v_net_worth_daily: daily } = generateDemoData(NOON);
    expect(daily.at(-1)!.snapshot_date).toBe(formatISODate(NOON));
  });

  it("puts imported net worth history before the live series", () => {
    const db = generateDemoData(NOON);
    const firstLive = db.v_net_worth_daily[0]!.snapshot_date!;
    for (const r of [...db.net_worth_history, ...db.net_worth_reconstructed]) {
      expect(r.snapshot_date < firstLive!).toBe(true);
    }
  });
});

describe("generateDemoData: determinism", () => {
  it("gives identical data for the same day, whatever the time", () => {
    const a = generateDemoData(new Date(2026, 9, 19, 0, 5));
    const b = generateDemoData(new Date(2026, 9, 19, 22, 40));
    expect(b).toEqual(a);
  });

  it("changes with the day and shifts dates with it", () => {
    const today = generateDemoData(NOON);
    const next = generateDemoData(new Date(2026, 9, 20, 12));
    expect(next).not.toEqual(today);
    expect(next.v_net_worth_daily.at(-1)!.snapshot_date).toBe("2026-10-20");
  });
});

describe("generateDemoData: internal consistency", () => {
  const db = generateDemoData(NOON);

  it("view v_transactions_eur mirrors live transactions with the right sign", () => {
    const live = db.transactions.filter((t) => !t.deleted_at);
    expect(db.v_transactions_eur).toHaveLength(live.length);
    for (const v of db.v_transactions_eur) {
      expect(Math.sign(v.signed_amount_eur!)).toBe(v.credit_debit_indicator === "DBIT" ? -1 : 1);
    }
  });

  it("monthly category spend is spend transactions plus Splitwise shares, plus history for months with no spend", () => {
    const inMonth = (date: string, row: { month: string | null }) =>
      date.slice(0, 7) === row.month!.slice(0, 7);
    for (const row of db.v_spend_by_category_monthly) {
      const spend = db.v_transactions_eur.filter(
        (t) => t.flow_type === "spend" && inMonth(t.booking_date!, row),
      );
      const bank = spend
        .filter((t) => t.category === row.category)
        .reduce((s, t) => s + Math.abs(t.personal_amount ?? t.signed_amount_eur!), 0);
      const shares = db.v_splitwise_eur
        .filter(
          (e) => (e.category ?? "Uncategorized") === row.category && inMonth(e.booking_date!, row),
        )
        .reduce((s, e) => s + e.amount_eur!, 0);
      const history =
        spend.length === 0
          ? db.spend_history
              .filter((h) => h.category === row.category && inMonth(h.month, row))
              .reduce((s, h) => s + h.spend_eur, 0)
          : 0;
      expect(row.spend_eur).toBeCloseTo(bank + shares + history, 1);
    }
  });

  it("income vs expenses has one row per month, month always the 1st", () => {
    const months = db.v_income_vs_expenses_monthly.map((r) => r.month!);
    expect(new Set(months).size).toBe(months.length);
    for (const m of months) expect(m.endsWith("-01")).toBe(true);
  });

  it("daily net worth total is bank + portfolio + crypto", () => {
    for (const d of db.v_net_worth_daily) {
      expect(d.total_eur).toBeCloseTo(
        d.bank_total_eur! + d.portfolio_total_eur! + d.crypto_total_eur!,
        1,
      );
    }
  });

  it("every transaction points at a demo account", () => {
    const uids = new Set(db.accounts.map((a) => a.uid));
    for (const t of db.transactions) expect(uids.has(t.account_uid!)).toBe(true);
  });
});

describe("generateDemoData: never real data", () => {
  const db = generateDemoData(NOON);

  it("uses one fixed fake user everywhere", () => {
    for (const rows of Object.values(db)) {
      for (const r of rows as Array<{ user_id?: string | null }>) {
        if ("user_id" in r) expect(r.user_id).toBe(DEMO_USER_ID);
      }
    }
  });

  it("uses obviously fake IBANs", () => {
    for (const a of db.accounts) expect(a.iban).toMatch(/^[A-Z]{2}00DEMO/);
  });
});

describe("generateDemoData: any day of the year", () => {
  it("always has fresh data, a refund pair, a split bill and a recurring charge", () => {
    for (let i = 0; i < 366; i += 7) {
      const today = new Date(2026, 0, 1 + i, 12);
      const { transactions, v_subscriptions } = generateDemoData(today);
      const latest = Math.min(...transactions.map((t) => dayOffset(t.booking_date!, today)));
      expect(latest).toBeLessThanOrEqual(1);
      expect(transactions.some((t) => t.refund_of)).toBe(true);
      expect(transactions.some((t) => t.owed_by)).toBe(true);
      expect(transactions.some((t) => t.flow_type === "transfer")).toBe(true);
      expect(v_subscriptions.every((s) => (s.charge_count ?? 0) >= 2)).toBe(true);
    }
  }, 30_000);
});

describe("generateDemoData: the dashboard tells one story", () => {
  const db = generateDemoData(NOON);
  const live = db.v_net_worth_daily;
  const last = live.at(-1)!;
  const daysBetween = (a: string, b: string) => dayOffset(a, new Date(`${b}T12:00:00`));

  it("today's net worth parts match the Accounts, Portfolio and Crypto screens", () => {
    const sumOf = (xs: Array<number | null>) => xs.reduce<number>((s, x) => s + (x ?? 0), 0);
    expect(last.bank_total_eur).toBeCloseTo(
      sumOf(db.v_bank_accounts_latest.map((a) => a.amount_eur)),
      1,
    );
    expect(last.portfolio_total_eur).toBeCloseTo(
      sumOf(db.v_portfolio_latest.map((p) => p.value_eur)),
      1,
    );
    expect(last.crypto_total_eur).toBeCloseTo(sumOf(db.v_crypto_latest.map((c) => c.value_eur)), 1);
  });

  it("the history joins the live series without holes or jumps", () => {
    const dates = [
      ...db.net_worth_history.map((h) => h.snapshot_date),
      ...db.net_worth_reconstructed.map((r) => r.snapshot_date),
      live[0]!.snapshot_date,
    ].sort();
    for (let i = 1; i < dates.length; i++) {
      expect(daysBetween(dates[i - 1]!, dates[i]!)).toBeGreaterThanOrEqual(1);
      expect(daysBetween(dates[i - 1]!, dates[i]!)).toBeLessThanOrEqual(45);
    }
    const lastPast = [...db.net_worth_history, ...db.net_worth_reconstructed]
      .map((r) => r as { snapshot_date: string } & Record<string, number | string | null>)
      .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date))
      .at(-1)!;
    const total =
      (lastPast["total_eur"] as number | undefined) ??
      (lastPast["stocks_eur"] as number) +
        (lastPast["bonds_eur"] as number) +
        (lastPast["cash_eur"] as number) +
        (lastPast["crypto_eur"] as number);
    expect(Math.abs(total / live[0]!.total_eur! - 1)).toBeLessThan(0.08);
  });

  it("the history moves: allocation is not a frozen block", () => {
    const stocks = new Set(db.net_worth_history.map((h) => h.stocks_eur));
    const crypto = new Set(db.net_worth_reconstructed.map((r) => r.crypto_eur));
    expect(stocks.size).toBe(db.net_worth_history.length);
    expect(crypto.size).toBe(db.net_worth_reconstructed.length);
    const share = (h: (typeof db.net_worth_history)[number]) => h.crypto_eur / h.total_eur;
    expect(new Set(db.net_worth_history.map((h) => share(h).toFixed(3))).size).toBeGreaterThan(3);
  });

  it("income beats spending in every full month, like a person who saves", () => {
    const months = db.v_income_vs_expenses_monthly.slice(1);
    expect(months.length).toBeGreaterThanOrEqual(2);
    for (const m of months) expect(m.income_eur!).toBeGreaterThan(m.expenses_eur!);
  });

  it("savings grow by exactly what was transferred out of the current account", () => {
    const first = db.net_worth_snapshots
      .filter((s) => s.account_uid === "demo-acc-savings")
      .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
    const moved = db.transactions
      .filter((t) => t.flow_type === "transfer" && t.booking_date! > first[0]!.snapshot_date)
      .reduce((s, t) => s + t.amount, 0);
    expect(first.at(-1)!.amount - first[0]!.amount).toBeCloseTo(moved, 1);
  });

  it("the Income page total matches the monthly report", () => {
    for (const m of db.v_income_vs_expenses_monthly) {
      const income = db.v_transactions_eur
        .filter((t) => t.flow_type === "income" && t.booking_date!.startsWith(m.month!.slice(0, 7)))
        .reduce((s, t) => s + Math.abs(t.signed_amount_eur!), 0);
      expect(m.income_eur).toBeCloseTo(income, 1);
    }
  });

  it("splitwise expenses carry a category that fits their description", () => {
    const fit: Record<string, string> = {
      "Weekend groceries": "Groceries",
      "Electricity bill": "Housing",
      "Dinner out": "Dine Out",
      "Movie night": "Entertainment",
    };
    for (const e of db.splitwise_expenses) expect(e.category).toBe(fit[e.description]);
  });

  it("only a minority of answered purchases are 'not worth it'", () => {
    const answered = db.transactions.filter((t) => t.worth_it);
    const no = answered.filter((t) => t.worth_it === "no").length;
    expect(no / answered.length).toBeLessThan(0.25);
    expect(no).toBeGreaterThan(0);
  });

  it("portfolio and crypto values are shares or coins times price", () => {
    for (const p of db.v_portfolio_latest)
      expect(p.value_native).toBeCloseTo(p.shares! * p.price!, 0);
    for (const c of db.v_crypto_latest)
      expect(c.value_usd).toBeCloseTo(c.amount! * c.price_usd!, 0);
  });
});
