import { formatISODate } from "@/lib/date";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { DEMO_USER_ID, generateDemoData, type DemoDb } from "./generate";
import { demoHoldingPerformance } from "./performance";
import { deriveViews } from "./views";
import { onDemoExit } from "./mode";
import { ACCOUNT_TYPES, isDebt } from "@/lib/account-types";

// A stand-in for the Supabase client that answers from generated, in-memory data. It makes no
// network calls at all, and every write lives only in this object: a reload starts over.

type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;
type Mode = "select" | "insert" | "update" | "upsert" | "delete";
interface Result {
  data: unknown;
  error: { message: string } | null;
  count?: number | null;
}

const DISABLED = { message: "Disabled in the demo." };
// Tables a write can change a view of.
const FEEDS_VIEWS = new Set([
  "transactions",
  "subscription_billing_overrides",
  "splitwise_expenses",
  "portfolio_holdings",
  "portfolio_snapshots",
  "crypto_holdings",
  "crypto_snapshots",
]);

// What add-holding finds in the demo: a few well-known names, priced at fixed demo prices.
interface DemoSecurity {
  id: string;
  symbol: string;
  name: string;
  detail: string;
  price: number;
  currency: string;
  type: string;
}
const DEMO_SECURITIES: Record<"stock" | "crypto", Array<DemoSecurity>> = {
  stock: [
    {
      id: "VWCE.DE",
      symbol: "VWCE.DE",
      name: "Vanguard FTSE All-World UCITS ETF",
      detail: "ETF · XETRA",
      price: 128,
      currency: "EUR",
      type: "ETF",
    },
    {
      id: "IWDA.AS",
      symbol: "IWDA.AS",
      name: "iShares Core MSCI World UCITS ETF",
      detail: "ETF · Amsterdam",
      price: 97,
      currency: "EUR",
      type: "ETF",
    },
    {
      id: "AAPL",
      symbol: "AAPL",
      name: "Apple Inc.",
      detail: "Stock · NASDAQ",
      price: 190,
      currency: "USD",
      type: "Stock",
    },
  ],
  crypto: [
    {
      id: "bitcoin",
      symbol: "BTC",
      name: "Bitcoin",
      detail: "Rank #1",
      price: 65000,
      currency: "USD",
      type: "Crypto",
    },
    {
      id: "ethereum",
      symbol: "ETH",
      name: "Ethereum",
      detail: "Rank #2",
      price: 3200,
      currency: "USD",
      type: "Crypto",
    },
    {
      id: "solana",
      symbol: "SOL",
      name: "Solana",
      detail: "Rank #5",
      price: 150,
      currency: "USD",
      type: "Crypto",
    },
  ],
};
const DEMO_USD_TO_EUR = 0.92;

// Same answer shape as a non-2xx from the real function: the panel reads error.context.
const functionError = (status: number, message: string) => ({
  data: null,
  error: { message, context: new Response(JSON.stringify({ error: message }), { status }) },
});

const compare = (a: unknown, b: unknown) => {
  const [x, y] = [a, b] as Array<number | string>;
  return x! < y! ? -1 : x! > y! ? 1 : 0;
};

function makeFilter(op: string, col: string, v: unknown): Filter {
  switch (op) {
    case "eq":
      return (r) => r[col] === v;
    case "neq":
      return (r) => r[col] != null && r[col] !== v;
    case "gt":
      return (r) => r[col] != null && compare(r[col], v) > 0;
    case "gte":
      return (r) => r[col] != null && compare(r[col], v) >= 0;
    case "lt":
      return (r) => r[col] != null && compare(r[col], v) < 0;
    case "lte":
      return (r) => r[col] != null && compare(r[col], v) <= 0;
    case "in":
      return (r) => (v as Array<unknown>).includes(r[col]);
    case "is":
      return (r) => (v === null ? r[col] == null : r[col] === v);
    default:
      throw new Error(`Demo client: unsupported filter "${op}"`);
  }
}

// What the AI would find in a statement PDF: in the demo, three made-up rows from the last days.
function demoStatementRows(now: Date) {
  const day = (back: number) =>
    formatISODate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - back));
  return [
    { date: day(1), description: "Trattoria Demo", amount: 38.4, direction: "DBIT" },
    { date: day(2), description: "Farmacia Esempio", amount: 12.9, direction: "DBIT" },
    { date: day(3), description: "Rimborso spese", amount: 120, direction: "CRDT" },
  ];
}

class Store {
  readonly db: Record<string, Array<Row>>;
  private nextId = 1;
  private readonly shapes: Map<string, Row>;
  constructor(now: Date) {
    this.db = generateDemoData(now) as unknown as Record<string, Array<Row>>;
    // Read each table's shape once: the first row is gone once a table is emptied.
    this.shapes = new Map(Object.entries(this.db).map(([t, rows]) => [t, rows[0] ?? {}]));
  }
  private readonly aliases = new Map<string, string>();
  /** Mirror of the database function rename_merchant: returns how many rows changed. */
  renameMerchant(ref: string, account: unknown, name: string | null): number {
    const txs = this.db["transactions"]!;
    const isTarget = (r: Row) =>
      r["entry_reference"] === ref && (r["account_uid"] ?? null) === (account ?? null);
    const target = txs.find(isTarget);
    const clean = name?.trim() || null;
    const source = target?.["creditor_name"] as string | null | undefined;
    const rawKey = target?.["merchant_key"] as string | null | undefined;
    // Aggregators (PayPal, ...) say nothing about the real merchant, so they never group rows.
    const key = rawKey && !["paypal", "apple", "google"].includes(rawKey) ? rawKey : null;
    let changed: Array<Row>;
    if (!source) {
      changed = txs.filter(isTarget);
    } else {
      const old = this.aliases.get(source);
      if (clean) this.aliases.set(source, clean);
      else this.aliases.delete(source);
      changed = txs.filter(
        (r) =>
          ((key !== null && r["merchant_key"] === key) || r["creditor_name"] === source) &&
          (r["custom_name"] == null || r["custom_name"] === old || isTarget(r)),
      );
    }
    for (const r of changed) r["custom_name"] = clean;
    this.refresh();
    return changed.length;
  }
  /** Mirror of the database function add_manual_transaction: returns the new row's key. */
  addManualTransaction(args: Record<string, unknown>): {
    data: Array<{ account_uid: string; entry_reference: string }> | null;
    error: { message: string } | null;
  } {
    const amount = Number(args["p_amount"]);
    const description = String(args["p_description"] ?? "").trim();
    const direction = args["p_direction"];
    if (!(amount > 0)) return { data: null, error: { message: "amount must be above zero" } };
    if (!description) return { data: null, error: { message: "description is required" } };
    if (direction !== "DBIT" && direction !== "CRDT")
      return { data: null, error: { message: "direction must be DBIT or CRDT" } };
    const source = String(args["p_source"] ?? "").trim() || "Manual";
    const currency =
      String(args["p_currency"] ?? "")
        .trim()
        .toUpperCase() || "EUR";
    const category = (args["p_category"] as string | null | undefined) ?? null;
    const accounts = this.db["accounts"]!;
    let account = accounts.find(
      (a) => a["manual"] && a["label"] === source && a["currency"] === currency,
    );
    if (!account) {
      account = this.withDefaults("accounts", {
        uid: `demo-manual-${this.nextId++}`,
        currency,
        label: source,
        bank_name: source,
        manual: true,
        consent_valid_until: null,
        iban: null,
      });
      accounts.push(account);
    }
    const entry_reference = `manual-${this.nextId++}`;
    const date = String(args["p_booking_date"]);
    this.db["transactions"]!.push(
      this.withDefaults("transactions", {
        entry_reference,
        account_uid: account["uid"],
        amount,
        currency,
        credit_debit_indicator: direction,
        creditor_name: description,
        custom_name: null,
        booking_date: date,
        value_date: date,
        category,
        category_source: category ? "manual" : null,
        flow_type: category === "Transfer" ? "transfer" : direction === "DBIT" ? "spend" : "income",
        flow_source: "user",
        transaction_type: null,
        worth_it: null,
        personal_amount: null,
        owed_by: null,
        refund_of: null,
        deleted_at: null,
      }),
    );
    this.refresh();
    return { data: [{ account_uid: account["uid"] as string, entry_reference }], error: null };
  }
  /** Moves the day's net worth from one account balance to another: debts count in liabilities
   * (subtracted from the total), everything else in bank, like v_net_worth_daily. */
  private moveNetWorth(date: unknown, before: [number, boolean], after: [number, boolean]): void {
    const day = this.db["v_net_worth_daily"]!.find((r) => r["snapshot_date"] === date);
    if (!day) return;
    const part = ([eur, debt]: [number, boolean]) => (debt ? [0, Math.abs(eur)] : [eur, 0]);
    const [bank0, owed0] = part(before);
    const [bank1, owed1] = part(after);
    day["bank_total_eur"] = Number(day["bank_total_eur"]) + bank1! - bank0!;
    day["liabilities_eur"] = Number(day["liabilities_eur"] ?? 0) + owed1! - owed0!;
    day["total_eur"] = Number(day["total_eur"]) + bank1! - bank0! - (owed1! - owed0!);
  }
  private latestDay(): string {
    return this.db["v_net_worth_daily"]!.reduce(
      (a, r) => (String(r["snapshot_date"]) > a ? String(r["snapshot_date"]) : a),
      "",
    );
  }
  /** Mirror of the database function set_account_type: past net worth follows the new type. */
  setAccountType(uid: unknown, type: unknown): Result {
    if (type !== null && !ACCOUNT_TYPES.some(([t]) => t === type))
      return { data: null, error: { message: "unknown account type" } };
    const account = this.db["accounts"]!.find((a) => a["uid"] === uid);
    if (!account) return { data: null, error: { message: "account not found" } };
    const [was, now] = [isDebt(account["account_type"] as string | null), isDebt(type as string)];
    account["account_type"] = type;
    for (const r of this.db["v_bank_accounts_latest"]!)
      if (r["uid"] === uid) r["account_type"] = type;
    if (was !== now)
      for (const s of this.db["net_worth_snapshots"]!.filter((s) => s["account_uid"] === uid)) {
        const eur = Number(s["eur_equivalent"] ?? 0);
        this.moveNetWorth(s["snapshot_date"], [eur, was], [eur, now]);
      }
    return { data: null, error: null };
  }
  /** Mirror of the database function add_manual_debt: a manual loan with today's balance. */
  addManualDebt(args: Record<string, unknown>): Result {
    const name = String(args["p_name"] ?? "").trim();
    const amount = Number(args["p_amount"]);
    if (!name) return { data: null, error: { message: "name is required" } };
    if (args["p_amount"] == null || !Number.isFinite(amount))
      return { data: null, error: { message: "amount is required" } };
    const currency = String(args["p_currency"] ?? "EUR").toUpperCase();
    const rate = this.db["fx_rates"]!.filter((r) => r["currency"] === currency)
      .sort((a, b) => String(b["date"]).localeCompare(String(a["date"])))
      .at(0)?.["rate_to_eur"];
    const eur = currency === "EUR" ? amount : amount * Number(rate ?? 1);
    const uid = `demo-debt-${this.nextId++}`;
    const today = this.latestDay();
    this.db["accounts"]!.push(
      this.withDefaults("accounts", {
        uid,
        user_id: DEMO_USER_ID,
        label: name,
        bank_name: name,
        currency,
        manual: true,
        account_type: "loan",
        iban: null,
        consent_valid_until: null,
      }),
    );
    this.db["net_worth_snapshots"]!.push({
      account_uid: uid,
      amount,
      currency,
      eur_equivalent: eur,
      snapshot_date: today,
      user_id: DEMO_USER_ID,
    });
    this.db["v_bank_accounts_latest"]!.push({
      uid,
      user_id: DEMO_USER_ID,
      label: name,
      bank_name: name,
      bank_logo: null,
      bank_country: null,
      iban: null,
      currency,
      consent_valid_until: null,
      snapshot_date: today,
      amount,
      amount_eur: eur,
      account_type: "loan",
      manual: true,
    });
    this.moveNetWorth(today, [0, true], [eur, true]);
    return { data: uid, error: null };
  }
  /** Mirror of the database function set_manual_balance: today's balance of a manual account. */
  /** Mirror of the database function delete_manual_debt: the debt leaves net worth, past days too. */
  deleteManualDebt(uid: unknown): Result {
    const account = this.db["accounts"]!.find((a) => a["uid"] === uid);
    if (!account) return { data: null, error: { message: "account not found" } };
    if (!account["manual"] || !isDebt(account["account_type"] as string | null))
      return { data: null, error: { message: "not a manual debt" } };
    const mine = (r: Row) => r["account_uid"] === uid;
    for (const s of this.db["net_worth_snapshots"]!.filter(mine))
      this.moveNetWorth(s["snapshot_date"], [Number(s["eur_equivalent"] ?? 0), true], [0, true]);
    this.db["net_worth_snapshots"] = this.db["net_worth_snapshots"]!.filter((r) => !mine(r));
    this.db["accounts"] = this.db["accounts"]!.filter((a) => a !== account);
    this.db["v_bank_accounts_latest"] = this.db["v_bank_accounts_latest"]!.filter(
      (r) => r["uid"] !== uid,
    );
    return { data: null, error: null };
  }
  setManualBalance(uid: unknown, value: unknown): Result {
    const account = this.db["accounts"]!.find((a) => a["uid"] === uid);
    if (!account) return { data: null, error: { message: "account not found" } };
    if (!account["manual"]) return { data: null, error: { message: "not a manual account" } };
    const amount = Number(value);
    const row = this.db["v_bank_accounts_latest"]!.find((r) => r["uid"] === uid);
    if (!row || !Number.isFinite(amount)) return { data: null, error: null };
    const oldEur = Number(row["amount_eur"] ?? 0);
    const eur = row["amount"] ? (oldEur * amount) / Number(row["amount"]) : amount;
    const debt = isDebt(account["account_type"] as string | null);
    const today = this.latestDay();
    // Only today's balance changes; earlier days keep theirs.
    const snap = this.db["net_worth_snapshots"]!.find(
      (s) => s["account_uid"] === uid && s["snapshot_date"] === today,
    );
    if (snap) Object.assign(snap, { amount, eur_equivalent: eur });
    else
      this.db["net_worth_snapshots"]!.push({
        account_uid: uid,
        amount,
        currency: account["currency"],
        eur_equivalent: eur,
        snapshot_date: today,
        user_id: DEMO_USER_ID,
      });
    this.moveNetWorth(today, [oldEur, debt], [eur, debt]);
    Object.assign(row, { amount, amount_eur: eur, snapshot_date: today });
    return { data: null, error: null };
  }
  /** Mirror of the database function resolve_transfer_pair: keep makes both sides a transfer the
   * user decided; not keeping puts each back by its direction. */
  resolveTransferPair(id: unknown, keep: boolean): Result {
    const pair = this.db["transfer_pairs"]!.find((p) => p["id"] === id);
    if (!pair || pair["status"] !== "suggested")
      return { data: null, error: { message: "pair not found" } };
    const sides = [
      [pair["out_account_uid"], pair["out_ref"]],
      [pair["in_account_uid"], pair["in_ref"]],
    ];
    const rows = this.db["transactions"]!.filter((r) =>
      sides.some(([a, ref]) => r["account_uid"] === a && r["entry_reference"] === ref),
    );
    // Like the database: Keep is refused once a side was changed since the pairing.
    if (
      keep &&
      (rows.length < 2 || rows.some((r) => !["pair", "bank"].includes(String(r["flow_source"]))))
    )
      return { data: null, error: { message: "pair is stale" } };
    pair["status"] = keep ? "confirmed" : "rejected";
    for (const r of rows) {
      r["flow_source"] = "user";
      if (!keep) r["flow_type"] = r["credit_debit_indicator"] === "DBIT" ? "spend" : "income";
    }
    this.refresh();
    return { data: null, error: null };
  }
  /** Mirror of the database function set_holding_quantity: the new quantity, and today's value
   * from the latest price, taken into net worth at once. Returns how many holdings changed. */
  setHoldingQuantity(kind: unknown, key: unknown, quantity: unknown, source: unknown): number {
    const db = this.db;
    const stock = kind === "stock";
    const qty = Number(quantity);
    const isRow = (r: Row) =>
      stock ? r["isin"] === key : r["asset_symbol"] === key && r["source"] === source;
    const holding = db[stock ? "portfolio_holdings" : "crypto_holdings"]!.find(isRow);
    if (!holding || !(qty >= 0)) return 0;
    const qtyField = stock ? "shares" : "amount";
    const oldQty = Number(holding[qtyField]);
    holding[qtyField] = qty;
    const snaps = db[stock ? "portfolio_snapshots" : "crypto_snapshots"]!.filter(isRow);
    const last = snaps.reduce<Row | undefined>(
      (a, r) => (!a || String(r["snapshot_date"]) > String(a["snapshot_date"]) ? r : a),
      undefined,
    );
    if (last && oldQty > 0) {
      const oldValue = Number(last["value_eur"] ?? 0);
      const newValue = (oldValue * qty) / oldQty;
      last["value_eur"] = newValue;
      if (stock) last["value_native"] = (Number(last["value_native"] ?? 0) * qty) / oldQty;
      else {
        last["amount"] = qty;
        last["value_usd"] = (Number(last["value_usd"] ?? 0) * qty) / oldQty;
      }
      const daily = db["v_net_worth_daily"] ?? [];
      const latest = daily.reduce<Row | undefined>(
        (a, r) => (!a || String(r["snapshot_date"]) > String(a["snapshot_date"]) ? r : a),
        undefined,
      );
      if (latest) {
        const field = stock ? "portfolio_total_eur" : "crypto_total_eur";
        latest[field] = Number(latest[field]) + newValue - oldValue;
        latest["total_eur"] = Number(latest["total_eur"]) + newValue - oldValue;
      }
    }
    this.refresh();
    return 1;
  }
  /** Mirror of the database function delete_holding: returns how many holdings were deleted. */
  deleteHolding(kind: unknown, key: unknown, source: unknown): number {
    const db = this.db;
    const stock = kind === "stock";
    const isRow = (r: Row) =>
      stock ? r["isin"] === key : r["asset_symbol"] === key && r["source"] === source;
    const snapTable = stock ? "portfolio_snapshots" : "crypto_snapshots";
    const holdTable = stock ? "portfolio_holdings" : "crypto_holdings";
    // The demo's net worth is generated once, so take the deleted value out of it by hand.
    const removed = new Map<string, number>();
    for (const s of db[snapTable]!.filter(isRow)) {
      const d = s["snapshot_date"] as string;
      removed.set(d, (removed.get(d) ?? 0) + ((s["value_eur"] as number | null) ?? 0));
    }
    for (const r of db["v_net_worth_daily"] ?? []) {
      const minus = removed.get(r["snapshot_date"] as string) ?? 0;
      const field = stock ? "portfolio_total_eur" : "crypto_total_eur";
      r[field] = (r[field] as number) - minus;
      r["total_eur"] = (r["total_eur"] as number) - minus;
    }
    db[snapTable] = db[snapTable]!.filter((r) => !isRow(r));
    const before = db[holdTable]!.length;
    db[holdTable] = db[holdTable]!.filter((r) => !isRow(r));
    const count = before - db[holdTable]!.length;
    const coinLeft = !stock && db[holdTable]!.some((r) => r["asset_symbol"] === key);
    if (!coinLeft) {
      db["holding_trades"] = (db["holding_trades"] ?? []).filter(
        (t) => !(t["kind"] === (stock ? "stock" : "crypto") && t["key"] === key),
      );
    }
    this.refresh();
    return count;
  }
  /** Mirror of the database function stream_action: an {error} where the SQL raises. */
  streamAction(id: unknown, action: unknown, args: Row = {}): Result {
    const row = this.db["recurring_streams"]!.find((r) => r["id"] === id);
    if (!row) return { data: null, error: { message: "stream not found" } };
    const bad = (message: string): Result => ({ data: null, error: { message } });
    if (action === "confirm") row["user_status"] = "confirmed";
    else if (action === "dismiss") row["user_status"] = "dismissed";
    else if (action === "undismiss")
      row["user_status"] = row["detected_status"] == null ? "confirmed" : null;
    else if (action === "set_cadence") {
      const cadence = args["cadence"] as string | undefined;
      const unit = args["custom_unit"];
      const value = args["custom_value"];
      if (cadence) {
        if (!["weekly", "monthly", "quarterly", "yearly"].includes(cadence))
          return bad("invalid cadence");
        Object.assign(row, {
          user_cadence: cadence,
          custom_interval_value: null,
          custom_interval_unit: null,
        });
      } else {
        if (
          !Number.isInteger(value) ||
          (value as number) <= 0 ||
          !["days", "weeks", "months", "years"].includes(unit as string)
        )
          return bad("invalid custom interval");
        Object.assign(row, {
          user_cadence: "custom",
          custom_interval_value: value,
          custom_interval_unit: unit,
        });
      }
      row["user_status"] = "confirmed";
    } else return bad("unknown action");
    return { data: null, error: null };
  }
  refresh(): void {
    Object.assign(this.db, deriveViews(this.db as unknown as DemoDb));
  }
  withDefaults(table: string, row: Row): Row {
    const sample = this.shapes.get(table);
    const out = { ...row };
    if (sample && "id" in sample && out["id"] == null) out["id"] = `demo-new-${this.nextId++}`;
    if (sample && "created_at" in sample && out["created_at"] == null)
      out["created_at"] = new Date().toISOString();
    return out;
  }
}

class Query implements PromiseLike<Result> {
  private filters: Array<Filter> = [];
  private sorts: Array<{ col: string; asc: boolean }> = [];
  private max: number | undefined;
  private skip = 0;
  private mode: Mode = "select";
  private payload: Array<Row> = [];
  private patch: Row = {};
  private conflict: Array<string> = [];
  private head = false;
  private wantCount = false;
  private one: "one" | "maybe" | null = null;

  constructor(
    private readonly store: Store,
    private readonly table: string,
  ) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    this.head = !!opts?.head;
    this.wantCount = !!opts?.count;
    return this;
  }
  insert(rows: Row | Array<Row>) {
    this.mode = "insert";
    this.payload = [rows].flat();
    return this;
  }
  upsert(rows: Row | Array<Row>, opts?: { onConflict?: string }) {
    this.mode = "upsert";
    this.payload = [rows].flat();
    this.conflict = opts?.onConflict?.split(",") ?? [];
    return this;
  }
  update(patch: Row) {
    this.mode = "update";
    this.patch = patch;
    return this;
  }
  delete() {
    this.mode = "delete";
    return this;
  }

  eq(c: string, v: unknown) {
    return this.where("eq", c, v);
  }
  neq(c: string, v: unknown) {
    return this.where("neq", c, v);
  }
  gt(c: string, v: unknown) {
    return this.where("gt", c, v);
  }
  gte(c: string, v: unknown) {
    return this.where("gte", c, v);
  }
  lt(c: string, v: unknown) {
    return this.where("lt", c, v);
  }
  lte(c: string, v: unknown) {
    return this.where("lte", c, v);
  }
  in(c: string, v: Array<unknown>) {
    return this.where("in", c, v);
  }
  is(c: string, v: unknown) {
    return this.where("is", c, v);
  }
  not(c: string, op: string, v: unknown) {
    const f = makeFilter(op, c, v);
    this.filters.push((r) => !f(r));
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.sorts.push({ col, asc: opts?.ascending ?? true });
    return this;
  }
  range(from: number, to: number) {
    this.skip = from;
    this.max = to + 1;
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  maybeSingle() {
    this.one = "maybe";
    return this;
  }
  single() {
    this.one = "one";
    return this;
  }

  private where(op: string, c: string, v: unknown) {
    this.filters.push(makeFilter(op, c, v));
    return this;
  }

  private execute(): Result {
    const rows = this.store.db[this.table];
    if (!rows)
      return { data: null, error: { message: `Unknown table "${this.table}" in the demo.` } };
    const matches = rows.filter((r) => this.filters.every((f) => f(r)));
    let affected = matches;
    if (this.mode === "insert") affected = this.payload.map((p) => this.insertRow(rows, p));
    if (this.mode === "upsert") affected = this.payload.map((p) => this.upsertRow(rows, p));
    if (this.mode === "update") matches.forEach((r) => Object.assign(r, this.patch));
    if (this.mode === "delete")
      this.store.db[this.table] = rows.filter((r) => !matches.includes(r));
    if (this.mode !== "select" && FEEDS_VIEWS.has(this.table)) this.store.refresh();

    const count = this.wantCount ? affected.length : null;
    if (this.head) return { data: null, error: null, count };
    if (this.mode === "delete") return { data: null, error: null, count };
    return this.shape(affected, count);
  }

  private insertRow(rows: Array<Row>, p: Row): Row {
    const row = this.store.withDefaults(this.table, p);
    rows.push(row);
    return row;
  }

  private upsertRow(rows: Array<Row>, p: Row): Row {
    const hit = rows.find(
      (r) => this.conflict.length > 0 && this.conflict.every((c) => r[c] === p[c]),
    );
    if (!hit) return this.insertRow(rows, p);
    return Object.assign(hit, p);
  }

  private shape(rows: Array<Row>, count: number | null): Result {
    const sorted = [...rows];
    for (const { col, asc } of [...this.sorts].reverse()) {
      sorted.sort((a, b) => {
        if (a[col] == null || b[col] == null)
          return (a[col] == null ? 1 : 0) - (b[col] == null ? 1 : 0);
        return asc ? compare(a[col], b[col]) : compare(b[col], a[col]);
      });
    }
    const copies = sorted.slice(this.skip, this.max).map((r) => ({ ...r }));
    if (this.one === null) return { data: copies, error: null, count };
    if (copies.length === 1) return { data: copies[0], error: null, count };
    if (copies.length === 0 && this.one === "maybe") return { data: null, error: null, count };
    return { data: null, error: { message: `Expected one row, got ${copies.length}.` } };
  }

  then<A = Result, B = never>(
    ok?: ((v: Result) => A | PromiseLike<A>) | null,
    fail?: ((e: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve()
      .then(() => this.execute())
      .then(ok, fail);
  }
}

function demoAddHolding(store: Store, now: Date, body: Record<string, unknown>) {
  const kind = body["kind"] === "crypto" ? "crypto" : "stock";
  const list = DEMO_SECURITIES[kind];
  if (body["action"] === "search") {
    const q = String(body["query"] ?? "").toLowerCase();
    const hits = list.filter((s) => `${s.name} ${s.symbol}`.toLowerCase().includes(q));
    return {
      data: {
        results: (hits.length > 0 ? hits : list).map(({ id, symbol, name, detail }) => ({
          id,
          symbol,
          name,
          detail,
        })),
      },
      error: null,
    };
  }
  const sec = list.find((s) => s.id === body["id"]);
  const quantity = Number(body["quantity"]);
  if (!sec || !(quantity > 0)) return functionError(400, "Invalid request");
  const today = now.toISOString().slice(0, 10);
  const user_id = DEMO_USER_ID;
  const db = store.db;
  if (kind === "stock") {
    const isin = (body["isin"] as string | undefined) ?? sec.id;
    if (db["portfolio_holdings"]!.some((h) => h["isin"] === isin)) {
      return functionError(409, "Already in your holdings: change its quantity instead");
    }
    const native = sec.price * quantity;
    db["portfolio_holdings"]!.push({
      asset_type: sec.type,
      broker_label: (body["broker"] as string | undefined) || "Other",
      created_at: now.toISOString(),
      isin,
      name: sec.name,
      shares: quantity,
      user_id,
      yahoo_symbol: sec.id,
    });
    db["portfolio_snapshots"]!.push({
      created_at: now.toISOString(),
      currency: sec.currency,
      isin,
      price: sec.price,
      snapshot_date: today,
      user_id,
      value_eur: sec.currency === "USD" ? native * DEMO_USD_TO_EUR : native,
      value_native: native,
    });
  } else {
    if (
      db["crypto_holdings"]!.some(
        (h) => h["asset_symbol"] === sec.symbol && h["source"] === "Manual",
      )
    ) {
      return functionError(409, "Already in your holdings: change its quantity instead");
    }
    const usd = sec.price * quantity;
    db["crypto_holdings"]!.push({
      amount: quantity,
      asset_symbol: sec.symbol,
      coingecko_id: sec.id,
      created_at: now.toISOString(),
      name: sec.name,
      source: "Manual",
      user_id,
    });
    db["crypto_snapshots"]!.push({
      amount: quantity,
      asset_symbol: sec.symbol,
      created_at: now.toISOString(),
      price_usd: sec.price,
      snapshot_date: today,
      source: "Manual",
      user_id,
      value_eur: usd * DEMO_USD_TO_EUR,
      value_usd: usd,
    });
  }
  store.refresh();
  return { data: { added: true, priced: true }, error: null };
}

export function createFakeClient(now: Date = new Date()): SupabaseClient<Database> {
  const store = new Store(now);
  const user = {
    id: DEMO_USER_ID,
    aud: "authenticated",
    role: "authenticated",
    email: "demo@example.com",
    app_metadata: {},
    user_metadata: { welcome_dismissed: true } as Record<string, unknown>,
    created_at: now.toISOString(),
  };
  const session = {
    access_token: "demo",
    refresh_token: "demo",
    expires_in: 3600,
    token_type: "bearer",
    user,
  };
  const listeners = new Set<(event: string, session: unknown) => void>();

  const client = {
    from: (table: string) => new Query(store, table),
    rpc: async (fn: string, args: Record<string, unknown> = {}) =>
      fn === "holding_performance"
        ? {
            data: demoHoldingPerformance(store.db),
            error: null,
          }
        : fn === "rename_merchant"
          ? {
              data: store.renameMerchant(
                args["p_entry_reference"] as string,
                args["p_account_uid"],
                (args["p_name"] as string | null) ?? null,
              ),
              error: null,
            }
          : fn === "resolve_transfer_pair"
            ? store.resolveTransferPair(args["p_pair"], args["p_keep"] === true)
            : fn === "stream_action"
              ? store.streamAction(args["p_stream"], args["p_action"], args["p_args"] as Row)
              : fn === "add_manual_transaction"
                ? store.addManualTransaction(args)
                : fn === "set_account_type"
                  ? store.setAccountType(args["p_account"], args["p_type"] ?? null)
                  : fn === "add_manual_debt"
                    ? store.addManualDebt(args)
                    : fn === "set_manual_balance"
                      ? store.setManualBalance(args["p_account"], args["p_amount"])
                      : fn === "delete_manual_debt"
                        ? store.deleteManualDebt(args["p_account"])
                        : fn === "set_holding_quantity"
                          ? {
                              data: store.setHoldingQuantity(
                                args["p_kind"],
                                args["p_key"],
                                args["p_quantity"],
                                args["p_source"],
                              ),
                              error: null,
                            }
                          : fn === "delete_holding"
                            ? {
                                data: store.deleteHolding(
                                  args["p_kind"],
                                  args["p_key"],
                                  args["p_source"],
                                ),
                                error: null,
                              }
                            : { data: null, error: DISABLED },
    functions: {
      invoke: async (name: string, opts?: { body?: Record<string, unknown> }) =>
        name === "add-holding"
          ? demoAddHolding(store, now, opts?.body ?? {})
          : name === "list-banks"
            ? {
                data: {
                  banks: [
                    { name: "Demo Bank", logo: null },
                    { name: "Sample Bank", logo: null },
                  ],
                },
                error: null,
              }
            : name === "parse-statement"
              ? { data: { rows: demoStatementRows(now) }, error: null }
              : name === "reapply-rules"
                ? { data: { changes: 0, sample: [] }, error: null } // demo rows already follow its rules
                : { data: null, error: DISABLED },
    },
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      getUser: async () => ({ data: { user }, error: null }),
      updateUser: async ({ data }: { data?: Record<string, unknown> }) => {
        Object.assign(user.user_metadata, data);
        return { data: { user }, error: null };
      },
      signInWithPassword: async () => ({ data: {}, error: DISABLED }),
      signOut: async () => {
        listeners.forEach((cb) => cb("SIGNED_OUT", null));
        return { error: null };
      },
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        listeners.add(cb);
        return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } };
      },
    },
  };
  return client as unknown as SupabaseClient<Database>;
}

let shared: SupabaseClient<Database> | null = null;
/** One fake client per demo visit; resetDemoClient() makes the next visit start from scratch. */
export const getDemoClient = () => (shared ??= createFakeClient());
export const resetDemoClient = () => {
  shared = null;
};

onDemoExit(resetDemoClient);
