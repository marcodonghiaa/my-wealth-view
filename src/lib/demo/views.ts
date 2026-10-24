import { DAY_MS, DEMO_USER_ID, round2, type DemoDb } from "./helpers";
import { buildMonthly, buildSubscriptions, signedEur } from "./bank-activity";

type Derived = Pick<
  DemoDb,
  | "v_transactions_eur"
  | "v_spend_by_category_monthly"
  | "v_income_vs_expenses_monthly"
  | "v_subscriptions"
  | "v_cd_holdings"
  | "v_splitwise_eur"
  | "v_portfolio_latest"
  | "v_crypto_latest"
>;

// Latest snapshot per holding, like the views' "distinct on ... order by snapshot_date desc".
function latestSnapshot<T extends { snapshot_date: string }>(
  rows: Array<T>,
  matches: (row: T) => boolean,
): T | undefined {
  let best: T | undefined;
  for (const row of rows)
    if (matches(row) && (!best || row.snapshot_date > best.snapshot_date)) best = row;
  return best;
}

// The database computes these views from the base tables. In the demo they are rebuilt from the
// in-memory tables, so an edit made while exploring shows up everywhere it would for real.
export function deriveViews(db: DemoDb, todayNum: number): Derived {
  const live = db.transactions.filter((t) => !t.deleted_at);
  const v_transactions_eur: DemoDb["v_transactions_eur"] = live.map((t) => ({
    account_uid: t.account_uid,
    amount: t.amount,
    booking_date: t.booking_date,
    category: t.category,
    created_at: t.created_at,
    credit_debit_indicator: t.credit_debit_indicator,
    // Like the real view: a name the user gave wins over the bank's.
    creditor_name: t.custom_name ?? t.creditor_name,
    currency: t.currency,
    entry_reference: t.entry_reference,
    flow_type: t.flow_type,
    owed_by: t.owed_by,
    owed_settled: t.owed_settled,
    personal_amount: t.personal_amount,
    // Unsplit: the whole charge is mine.
    personal_signed_amount_eur: t.personal_amount == null ? signedEur(t) : -t.personal_amount,
    refund_of: t.refund_of,
    settled_at: t.settled_at,
    signed_amount_eur: signedEur(t),
    transaction_type: t.transaction_type,
    user_id: DEMO_USER_ID,
    worth_it: t.worth_it,
  }));

  const v_splitwise_eur: DemoDb["v_splitwise_eur"] = db.splitwise_expenses.map((e) => ({
    amount: e.amount,
    amount_eur: e.amount,
    booking_date: e.booking_date,
    category: e.category,
    currency: e.currency,
    description: e.description,
    group_name: e.group_name,
    id: e.id,
    user_id: e.user_id,
  }));

  const v_cd_holdings: DemoDb["v_cd_holdings"] = db.cd_holdings.map((c) => {
    const start = Date.parse(c.start_date) / DAY_MS;
    const end = Date.parse(c.maturity_date) / DAY_MS;
    const elapsed = Math.max(0, Math.min(todayNum, end) - start);
    const value = round2(c.principal * (1 + c.annual_rate) ** (elapsed / 365.25));
    return {
      annual_rate: c.annual_rate,
      bank_label: c.bank_label,
      currency: c.currency,
      current_value_eur: value,
      current_value_native: value,
      days_elapsed: elapsed,
      id: c.id,
      is_matured: end <= todayNum,
      label: c.label,
      maturity_date: c.maturity_date,
      principal: c.principal,
      start_date: c.start_date,
      user_id: c.user_id,
    };
  });

  const v_portfolio_latest: DemoDb["v_portfolio_latest"] = db.portfolio_holdings.flatMap((h) => {
    const snap = latestSnapshot(
      db.portfolio_snapshots,
      (x) => x.isin === h.isin && x.user_id === h.user_id,
    );
    return snap
      ? [
          {
            asset_type: h.asset_type,
            broker_label: h.broker_label,
            currency: snap.currency,
            isin: h.isin,
            name: h.name,
            price: snap.price,
            shares: h.shares,
            snapshot_date: snap.snapshot_date,
            user_id: h.user_id,
            value_eur: snap.value_eur,
            value_native: snap.value_native,
          },
        ]
      : [];
  });
  const v_crypto_latest: DemoDb["v_crypto_latest"] = db.crypto_holdings.flatMap((h) => {
    const snap = latestSnapshot(
      db.crypto_snapshots,
      (x) => x.asset_symbol === h.asset_symbol && x.source === h.source && x.user_id === h.user_id,
    );
    return snap
      ? [
          {
            amount: h.amount,
            asset_symbol: h.asset_symbol,
            name: h.name,
            price_usd: snap.price_usd,
            snapshot_date: snap.snapshot_date,
            source: h.source,
            user_id: h.user_id,
            value_eur: snap.value_eur,
            value_usd: snap.value_usd,
          },
        ]
      : [];
  });

  return {
    v_portfolio_latest,
    v_crypto_latest,
    v_transactions_eur,
    ...buildMonthly(v_transactions_eur, v_splitwise_eur, db.spend_history),
    v_subscriptions: buildSubscriptions(live, db.subscription_billing_overrides),
    v_cd_holdings,
    v_splitwise_eur,
  };
}

export const todayNumOf = (now: Date) =>
  Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / DAY_MS);
