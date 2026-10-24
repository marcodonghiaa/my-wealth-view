import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { DEMO_USER_ID, generateDemoData, type DemoDb } from "./generate";
import { deriveViews, todayNumOf } from "./views";

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
  "cd_holdings",
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

class Store {
  readonly db: Record<string, Array<Row>>;
  private readonly todayNum: number;
  private nextId = 1;
  constructor(now: Date) {
    this.db = generateDemoData(now) as unknown as Record<string, Array<Row>>;
    this.todayNum = todayNumOf(now);
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
    let changed: Array<Row>;
    if (!source) {
      changed = txs.filter(isTarget);
    } else {
      const old = this.aliases.get(source);
      if (clean) this.aliases.set(source, clean);
      else this.aliases.delete(source);
      changed = txs.filter(
        (r) =>
          r["creditor_name"] === source &&
          (r["custom_name"] == null || r["custom_name"] === old || isTarget(r)),
      );
    }
    for (const r of changed) r["custom_name"] = clean;
    this.refresh();
    return changed.length;
  }
  refresh(): void {
    Object.assign(this.db, deriveViews(this.db as unknown as DemoDb, this.todayNum));
  }
  withDefaults(table: string, row: Row): Row {
    const sample = this.db[table]![0];
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
    const copies = sorted.slice(0, this.max).map((r) => ({ ...r }));
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
      fn === "rename_merchant"
        ? {
            data: store.renameMerchant(
              args["p_entry_reference"] as string,
              args["p_account_uid"],
              (args["p_name"] as string | null) ?? null,
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
