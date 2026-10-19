import {
  DEMO_USER_ID,
  MAIN,
  between,
  dayOfMonth,
  iso,
  monthStart,
  pick,
  rngFor,
  round2,
  stamp,
  type DemoDb,
  type Tx,
} from "./helpers";

// Transactions and the views derived from them (subscriptions, monthly spend and income).

// ---------- spending catalogue ----------

// Keeps the demo person solvent: monthly income beats everyday spending.
const SPEND_SCALE = 0.6;

type Merchant = { category: string; names: ReadonlyArray<string>; lo: number; hi: number };
const MERCHANTS: ReadonlyArray<Merchant> = [
  {
    category: "Groceries",
    names: ["Supermercato Verde", "Mercato Bio", "Alimentari Rossi"],
    lo: 12,
    hi: 68,
  },
  { category: "Groceries", names: ["Supermercato Verde", "Alimentari Rossi"], lo: 8, hi: 40 },
  {
    category: "Dine Out",
    names: ["Trattoria da Gino", "Caffè Centrale", "Pizzeria Napoli", "Sushi Demo"],
    lo: 6,
    hi: 48,
  },
  { category: "Dine Out", names: ["Caffè Centrale", "Bar Stazione"], lo: 2, hi: 9 },
  {
    category: "Transports",
    names: ["Trenitalia", "Taxi Milano", "Metro Pass", "Station Fuel"],
    lo: 2,
    hi: 55,
  },
  {
    category: "Shopping",
    names: ["Moda Urbana", "Libreria Aurora", "TechStore Demo", "Casa & Co"],
    lo: 15,
    hi: 120,
  },
  { category: "Entertainment", names: ["Cinema Lumière", "Concert Tickets"], lo: 10, hi: 45 },
  { category: "Health", names: ["Farmacia Salute", "Dentista Demo"], lo: 8, hi: 80 },
  { category: "Experiences", names: ["Museo Civico", "Weekend Spa"], lo: 15, hi: 90 },
  { category: "Services", names: ["Lavanderia Express", "Poste Italiane"], lo: 4, hi: 30 },
  { category: "Others", names: ["Mercatino", "Regalo"], lo: 5, hi: 40 },
];

type Recurring = { name: string; category: string; amount: number; day: number };
const SUBSCRIPTIONS: ReadonlyArray<Recurring> = [
  { name: "Netflix", category: "Entertainment", amount: 12.99, day: 5 },
  { name: "Spotify", category: "Entertainment", amount: 10.99, day: 12 },
  { name: "iCloud", category: "Services", amount: 2.99, day: 18 },
  { name: "Gym Demo", category: "Health", amount: 29.9, day: 3 },
  { name: "Fibra Casa", category: "Services", amount: 27.9, day: 22 },
];

// ---------- transactions ----------

function tx(
  p: Partial<Tx> & Pick<Tx, "entry_reference" | "amount"> & { booking_date: string },
): Tx {
  return {
    account_uid: MAIN,
    bank_transaction_code: null,
    category: null,
    created_at: stamp(p.booking_date),
    credit_debit_indicator: "DBIT",
    creditor_name: null,
    custom_name: null,
    currency: "EUR",
    debtor_name: null,
    import_batch_id: null,
    deleted_at: null,
    refund_of: null,
    flow_type: "spend",
    owed_by: null,
    owed_settled: false,
    personal_amount: null,
    raw: null,
    remittance_info: null,
    settled_at: null,
    transaction_type: "One-time",
    user_id: DEMO_USER_ID,
    value_date: p.booking_date,
    worth_it: null,
    worth_it_prompted_at: null,
    ...p,
  };
}

export function monthlyTransactions(n: number): Array<Tx> {
  const date = iso(n);
  const dom = dayOfMonth(n);
  const out: Array<Tx> = [];
  const ref = (k: string) => `demo-${date}-${k}`;
  for (const s of SUBSCRIPTIONS) {
    if (s.day !== dom) continue;
    out.push(
      tx({
        entry_reference: ref(s.name),
        booking_date: date,
        amount: s.amount,
        category: s.category,
        creditor_name: s.name,
        transaction_type: "Subscription",
      }),
    );
  }
  if (dom === 1) {
    out.push(
      tx({
        entry_reference: ref("rent"),
        booking_date: date,
        amount: 750,
        category: "Housing",
        creditor_name: "Affitto Demo",
      }),
    );
  }
  if (dom === 2) {
    out.push(
      tx({
        entry_reference: ref("salary"),
        booking_date: date,
        amount: 2450,
        category: "Income",
        creditor_name: null,
        debtor_name: "Acme Demo Srl",
        credit_debit_indicator: "CRDT",
        flow_type: "income",
      }),
    );
  }
  if (dom === 12) {
    out.push(
      tx({
        entry_reference: ref("freelance"),
        booking_date: date,
        amount: 320,
        category: "Income",
        debtor_name: "Studio Freelance Demo",
        credit_debit_indicator: "CRDT",
        flow_type: "income",
      }),
    );
  }
  if (dom === 28) {
    out.push(
      tx({
        entry_reference: ref("to-savings"),
        booking_date: date,
        amount: 300,
        category: "Transfer",
        creditor_name: "Risparmio Demo",
        flow_type: "transfer",
      }),
    );
  }
  return out;
}

export function dailyTransactions(n: number, todayNum: number): Array<Tx> {
  const date = iso(n);
  const r = rngFor(`tx|${date}`);
  const out: Array<Tx> = [];
  const count = 1 + Math.floor(r() * 3);
  for (let i = 0; i < count; i++) {
    const m = pick(r, MERCHANTS);
    const amount = between(r, m.lo * SPEND_SCALE, m.hi * SPEND_SCALE);
    const answer = r();
    out.push(
      tx({
        entry_reference: `demo-${date}-d${i}`,
        booking_date: date,
        amount,
        category: m.category,
        creditor_name: pick(r, m.names),
        // The last two days stay unanswered so the "was it worth it?" prompt has something to ask.
        worth_it: todayNum - n <= 1 || answer > 0.5 ? null : answer < 0.44 ? "yes" : "no",
      }),
    );
  }
  // Fixed rhythms guarantee a refund pair and a split bill in any window.
  if (n % 17 === 3) {
    const original = tx({
      entry_reference: `demo-${date}-gadget`,
      booking_date: date,
      amount: 89.9,
      category: "Shopping",
      creditor_name: "TechStore Demo",
      flow_type: "refunded",
    });
    out.push(original);
    if (n + 2 <= todayNum) {
      out.push(
        tx({
          entry_reference: `${original.entry_reference}-refund`,
          booking_date: iso(n + 2),
          amount: 89.9,
          category: "Shopping",
          credit_debit_indicator: "CRDT",
          flow_type: "refunded",
          refund_of: original.entry_reference,
        }),
      );
    }
  }
  if (n % 13 === 5) {
    out.push(
      tx({
        entry_reference: `demo-${date}-dinner`,
        booking_date: date,
        amount: 64,
        personal_amount: 32,
        owed_by: "Giulia",
        category: "Dine Out",
        creditor_name: "Pizzeria Napoli",
      }),
    );
  }
  return out;
}

export const signedEur = (t: Tx) => (t.credit_debit_indicator === "DBIT" ? -t.amount : t.amount);

// ---------- views derived from the base data ----------

const FREQUENCY_DAYS: Record<string, number> = {
  Weekly: 7,
  Monthly: 30,
  Quarterly: 91,
  Yearly: 365,
};
const UNIT_DAYS: Record<string, number> = { day: 1, week: 7, month: 30, year: 365 };

// Recurring charges grouped by merchant, with the user's manual overrides applied.
export function buildSubscriptions(
  txs: Array<Tx>,
  overrides: DemoDb["subscription_billing_overrides"],
): DemoDb["v_subscriptions"] {
  const byName = new Map<string, Array<Tx>>();
  for (const t of txs) {
    if (t.transaction_type !== "Subscription" || t.deleted_at || !t.creditor_name) continue;
    byName.set(t.creditor_name, [...(byName.get(t.creditor_name) ?? []), t]);
  }
  return [...byName.entries()].flatMap(([name, charges]) => {
    const o = overrides.find((x) => x.creditor_name === name);
    if (o?.dismissed) return [];
    const latest = [...charges]
      .sort((a, b) => a.booking_date!.localeCompare(b.booking_date!))
      .at(-1)!;
    const custom = o?.custom_interval_value && o.custom_interval_unit;
    const frequency = custom ? "Custom" : (o?.billing_frequency ?? "Monthly");
    const days = custom
      ? o.custom_interval_value! * (UNIT_DAYS[o.custom_interval_unit!] ?? 30)
      : (FREQUENCY_DAYS[frequency] ?? 30);
    return [
      {
        amount: latest.amount,
        billing_frequency: frequency,
        billing_frequency_is_manual: !!(o?.billing_frequency || custom),
        category: latest.category,
        charge_count: charges.length,
        creditor_name: name,
        currency: "EUR",
        custom_interval_unit: o?.custom_interval_unit ?? null,
        custom_interval_value: o?.custom_interval_value ?? null,
        interval_days: days,
        last_charged: latest.booking_date,
        monthly_equivalent_eur: round2((latest.amount * 30) / days),
        signed_amount_eur: -latest.amount,
        user_id: DEMO_USER_ID,
      },
    ];
  });
}

export function buildMonthly(
  view: DemoDb["v_transactions_eur"],
): Pick<DemoDb, "v_spend_by_category_monthly" | "v_income_vs_expenses_monthly"> {
  const spendByKey = new Map<string, { month: string; category: string; spend: number }>();
  const byMonth = new Map<string, { income: number; expenses: number }>();
  for (const t of view) {
    const month = monthStart(t.booking_date!);
    const cell = byMonth.get(month) ?? { income: 0, expenses: 0 };
    if (t.flow_type === "income") cell.income += Math.abs(t.signed_amount_eur!);
    if (t.flow_type === "spend") {
      const mine = Math.abs(t.personal_signed_amount_eur ?? t.signed_amount_eur!);
      cell.expenses += mine;
      const key = `${month}|${t.category}`;
      const row = spendByKey.get(key) ?? { month, category: t.category!, spend: 0 };
      row.spend += mine;
      spendByKey.set(key, row);
    }
    byMonth.set(month, cell);
  }
  return {
    v_spend_by_category_monthly: [...spendByKey.values()].map((s) => ({
      category: s.category,
      month: s.month,
      spend_eur: round2(s.spend),
      user_id: DEMO_USER_ID,
    })),
    v_income_vs_expenses_monthly: [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, c]) => ({
        month,
        income_eur: round2(c.income),
        expenses_eur: round2(c.expenses),
        user_id: DEMO_USER_ID,
      })),
  };
}
