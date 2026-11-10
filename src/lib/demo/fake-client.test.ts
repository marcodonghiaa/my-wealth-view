import { describe, expect, it, vi } from "vitest";
import { createFakeClient } from "./fake-client";
import { DEMO_USER_ID } from "./generate";
import { groupStreams } from "@/lib/recurring";
import type { Tables } from "@/integrations/supabase/types";

const NOW = new Date(2026, 9, 19, 12);
const fresh = () => createFakeClient(NOW);

describe("fake client: reading", () => {
  it("filters, sorts and limits like the real query builder", async () => {
    const { data } = await fresh()
      .from("v_transactions_eur")
      .select("entry_reference,booking_date,flow_type,amount")
      .gte("booking_date", "2026-10-01")
      .lt("booking_date", "2026-10-15")
      .in("flow_type", ["spend", "refunded"])
      .neq("amount", 0)
      .order("booking_date", { ascending: false })
      .order("entry_reference", { ascending: false })
      .limit(5);
    expect(data).toHaveLength(5);
    for (const r of data!) {
      expect(r.booking_date! >= "2026-10-01" && r.booking_date! < "2026-10-15").toBe(true);
      expect(["spend", "refunded"]).toContain(r.flow_type);
    }
    const dates = data!.map((r) => r.booking_date!);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it("handles is-null, not-is-null, lte and eq", async () => {
    const c = fresh();
    const { data: answered } = await c
      .from("transactions")
      .select("worth_it")
      .not("worth_it", "is", null)
      .is("deleted_at", null)
      .lte("booking_date", "2026-10-19")
      .eq("worth_it", "no");
    expect(answered!.length).toBeGreaterThan(0);
    expect(answered!.every((r) => r.worth_it === "no")).toBe(true);
  });

  it("supports head+count and maybeSingle", async () => {
    const c = fresh();
    const counted = await c.from("accounts").select("uid", { count: "exact", head: true });
    expect(counted.count).toBe(3);
    expect(counted.data).toBeNull();
    const one = await c.from("accounts").select("*").eq("uid", "demo-acc-main").maybeSingle();
    expect(one.data?.uid).toBe("demo-acc-main");
    const none = await c.from("accounts").select("*").eq("uid", "nope").maybeSingle();
    expect(none.data).toBeNull();
    expect(none.error).toBeNull();
  });

  it("returns an error, not a crash, for an unknown table", async () => {
    // @ts-expect-error not a real table
    const { error } = await fresh().from("nope").select("*");
    expect(error?.message).toMatch(/nope/);
  });

  it("hands out copies, so callers cannot corrupt the store", async () => {
    const c = fresh();
    const { data } = await c.from("accounts").select("*");
    data![0]!.label = "hacked";
    const again = await c.from("accounts").select("*");
    expect(again.data![0]!.label).not.toBe("hacked");
  });
});

describe("fake client: writes live in memory only", () => {
  it("an edited transaction shows up in the view and in the monthly totals", async () => {
    const c = fresh();
    const { data: before } = await c
      .from("v_transactions_eur")
      .select("entry_reference,category,amount")
      .eq("flow_type", "spend")
      .eq("category", "Groceries")
      .limit(1);
    const ref = before![0]!.entry_reference!;
    await c
      .from("transactions")
      .update({ category: "Others", worth_it: "no" })
      .eq("entry_reference", ref);
    const { data: after } = await c
      .from("v_transactions_eur")
      .select("category,worth_it")
      .eq("entry_reference", ref);
    expect(after![0]).toMatchObject({ category: "Others", worth_it: "no" });
    const { data: groceries } = await c
      .from("v_spend_by_category_monthly")
      .select("*")
      .eq("category", "Groceries");
    const { data: all } = await c
      .from("v_transactions_eur")
      .select("*")
      .eq("flow_type", "spend")
      .eq("category", "Groceries");
    const total = all!.reduce((s, t) => s + Math.abs(t.signed_amount_eur!), 0);
    // The monthly view also holds Splitwise shares and, for months with no spend, imported history.
    const { data: shares } = await c
      .from("v_splitwise_eur")
      .select("*")
      .eq("category", "Groceries");
    const shareTotal = shares!.reduce((s, e) => s + e.amount_eur!, 0);
    const { data: spendAll } = await c
      .from("v_transactions_eur")
      .select("*")
      .eq("flow_type", "spend");
    const spendMonths = new Set(spendAll!.map((t) => t.booking_date!.slice(0, 7)));
    const { data: hist } = await c.from("spend_history").select("*").eq("category", "Groceries");
    const histTotal = hist!
      .filter((h) => !spendMonths.has(h.month.slice(0, 7)))
      .reduce((s, h) => s + h.spend_eur, 0);
    expect(groceries!.reduce((s, r) => s + r.spend_eur!, 0)).toBeCloseTo(
      total + shareTotal + histTotal,
      1,
    );
  });

  it("inserts, deletes and upserts rows", async () => {
    const c = fresh();
    const { count: n } = await c
      .from("category_rules")
      .select("id", { count: "exact", head: true });
    await c.from("category_rules").insert({
      user_id: DEMO_USER_ID,
      match_field: "creditor_name",
      match_text: "X",
      set_category: "Others",
    });
    const { count: n1 } = await c
      .from("category_rules")
      .select("id", { count: "exact", head: true });
    expect(n1).toBe(n! + 1);
    await c.from("category_rules").delete().eq("match_text", "X");
    const { count: n2 } = await c
      .from("category_rules")
      .select("id", { count: "exact", head: true });
    expect(n2).toBe(n);
  });

  // Regression: once a table was emptied, new rows got no id, so deleting one
  // (`.eq("id", undefined)`) matched and removed every new row.
  it("gives new rows ids even after the table was emptied", async () => {
    const c = fresh();
    await c.from("category_rules").delete().neq("match_text", "");
    const rule = (match_text: string) => ({
      user_id: DEMO_USER_ID,
      match_field: "creditor_name",
      match_text,
      set_category: "Others",
    });
    await c.from("category_rules").insert(rule("alpha"));
    await c.from("category_rules").insert(rule("beta"));
    const { data } = await c.from("category_rules").select("id, match_text");
    const alpha = data!.find((r) => r.match_text === "alpha")!;

    await c.from("category_rules").delete().eq("id", alpha.id);

    const { data: left } = await c.from("category_rules").select("match_text");
    expect(left!.map((r) => r.match_text)).toEqual(["beta"]);
  });

  it("dismissing a subscription hides it; a manual frequency marks it manual", async () => {
    const c = fresh();
    const { data: subs } = await c.from("v_subscriptions").select("creditor_name");
    const [first, second] = subs!.map((s) => s.creditor_name!);
    await c
      .from("subscription_billing_overrides")
      .upsert(
        { user_id: DEMO_USER_ID, creditor_name: first!, dismissed: true },
        { onConflict: "user_id,creditor_name" },
      );
    await c
      .from("subscription_billing_overrides")
      .upsert(
        { user_id: DEMO_USER_ID, creditor_name: second!, billing_frequency: "Yearly" },
        { onConflict: "user_id,creditor_name" },
      );
    const { data } = await c.from("v_subscriptions").select("*");
    expect(data!.find((s) => s.creditor_name === first)).toBeUndefined();
    expect(data!.find((s) => s.creditor_name === second)).toMatchObject({
      billing_frequency: "Yearly",
      billing_frequency_is_manual: true,
    });
  });
});

describe("fake client: auth, functions and rpc", () => {
  it("is always signed in as the demo user, and sign-out notifies listeners", async () => {
    const c = fresh();
    expect((await c.auth.getSession()).data.session?.user.id).toBeTruthy();
    expect((await c.auth.getUser()).data.user?.id).toBeTruthy();
    const cb = vi.fn();
    const { data } = c.auth.onAuthStateChange(cb);
    await c.auth.signOut();
    expect(cb).toHaveBeenCalledWith("SIGNED_OUT", null);
    data.subscription.unsubscribe();
    expect((await c.auth.updateUser({ data: { welcome_dismissed: true } })).error).toBeNull();
  });

  it("lists demo banks but refuses to connect a real one", async () => {
    const c = fresh();
    const banks = await c.functions.invoke("list-banks", { body: { country: "IT" } });
    expect(banks.error).toBeNull();
    expect((banks.data as { banks: Array<unknown> }).banks.length).toBeGreaterThan(0);
    const consent = await c.functions.invoke("start-bank-consent", { body: {} });
    expect(consent.error?.message).toMatch(/demo/i);
  });

  it("renaming a merchant renames every transaction from it, and clearing undoes that", async () => {
    const c = fresh();
    const rename = (name: string | null, ref: string) =>
      (c.rpc as unknown as (f: string, a: object) => PromiseLike<{ data: number; error: unknown }>)(
        "rename_merchant",
        { p_entry_reference: ref, p_account_uid: "demo-acc-main", p_name: name },
      );
    const { data: rows } = await c
      .from("v_transactions_eur")
      .select("entry_reference,creditor_name")
      .eq("creditor_name", "Supermercato Verde");
    expect(rows!.length).toBeGreaterThan(1);
    const renamed = await rename("My grocer", rows![0]!.entry_reference!);
    expect(renamed.data).toBe(rows!.length);
    const { data: after } = await c
      .from("v_transactions_eur")
      .select("creditor_name")
      .eq("creditor_name", "My grocer");
    expect(after).toHaveLength(rows!.length);
    await rename(null, rows![0]!.entry_reference!);
    const { data: back } = await c
      .from("v_transactions_eur")
      .select("creditor_name")
      .eq("creditor_name", "Supermercato Verde");
    expect(back).toHaveLength(rows!.length);
  });

  describe("rename_merchant by merchant_key", () => {
    const renameAcross = async (key: string) => {
      const c = fresh();
      const base = {
        account_uid: "demo-acc-main",
        amount: 5,
        currency: "EUR",
        booking_date: "2026-10-10",
      };
      await c.from("transactions").insert([
        { ...base, entry_reference: "mk-1", creditor_name: "Cafe Uno Roma", merchant_key: key },
        { ...base, entry_reference: "mk-2", creditor_name: "Cafe Uno Milano", merchant_key: key },
      ] as never);
      const res = await (
        c.rpc as unknown as (f: string, a: object) => PromiseLike<{ data: number; error: unknown }>
      )("rename_merchant", {
        p_entry_reference: "mk-1",
        p_account_uid: "demo-acc-main",
        p_name: "Cafe Uno",
      });
      const { data } = await c
        .from("transactions")
        .select("entry_reference,custom_name")
        .in("entry_reference", ["mk-1", "mk-2"]);
      return { res, names: data!.map((r) => r.custom_name) };
    };

    it("renames every row sharing the merchant_key", async () => {
      const { res, names } = await renameAcross("cafe uno");
      expect(res.data).toBe(2);
      expect(names).toEqual(["Cafe Uno", "Cafe Uno"]);
    });

    it("does not spread a rename across an aggregator key", async () => {
      const { res, names } = await renameAcross("paypal");
      expect(res.data).toBe(1);
      expect(names).toEqual(["Cafe Uno", undefined]);
    });
  });

  it("refuses database functions that would import data", async () => {
    const { error } = await fresh().rpc("import_splitwise", {} as never);
    expect(error?.message).toMatch(/demo/i);
  });
});

describe("fake client: adding and editing holdings", () => {
  it("searches, adds a holding with today's price, then edits and sells it", async () => {
    const c = fresh();
    const search = await c.functions.invoke<{ results: Array<{ id: string }> }>("add-holding", {
      body: { action: "search", kind: "stock", query: "apple" },
    });
    expect(search.data!.results.map((r) => r.id)).toContain("AAPL");

    const add = await c.functions.invoke("add-holding", {
      body: {
        action: "add",
        kind: "stock",
        id: "AAPL",
        symbol: "AAPL",
        name: "Apple Inc.",
        quantity: 2,
      },
    });
    expect(add.error).toBeNull();
    const latest = async () =>
      (await c.from("v_portfolio_latest").select("isin,shares,value_eur").eq("isin", "AAPL")).data!;
    expect((await latest())[0]).toMatchObject({ isin: "AAPL", shares: 2 });
    expect((await latest())[0]!.value_eur).toBeGreaterThan(0);

    const again = await c.functions.invoke("add-holding", {
      body: {
        action: "add",
        kind: "stock",
        id: "AAPL",
        symbol: "AAPL",
        name: "Apple Inc.",
        quantity: 1,
      },
    });
    expect(again.error).not.toBeNull();

    await c.from("portfolio_holdings").update({ shares: 0 }).eq("isin", "AAPL");
    expect((await latest())[0]!.shares).toBe(0);
  });

  it("adds a coin to the crypto view", async () => {
    const c = fresh();
    await c.functions.invoke("add-holding", {
      body: {
        action: "add",
        kind: "crypto",
        id: "solana",
        symbol: "SOL",
        name: "Solana",
        quantity: 3,
      },
    });
    const { data } = await c
      .from("v_crypto_latest")
      .select("asset_symbol,source,amount")
      .eq("asset_symbol", "SOL");
    expect(data!.filter((r) => r.source === "Manual")).toMatchObject([
      { asset_symbol: "SOL", source: "Manual", amount: 3 },
    ]);
  });
});

describe("fake client: delete_holding", () => {
  type Rpc = (f: string, a: object) => PromiseLike<{ data: number; error: unknown }>;
  const latestTotal = async (c: ReturnType<typeof fresh>) => {
    const { data } = await c.from("v_net_worth_daily").select("snapshot_date,total_eur");
    return data!.reduce((a, r) => (r.snapshot_date! > a.snapshot_date! ? r : a)).total_eur!;
  };

  it("removes a stock with its snapshots and trades, and its value leaves net worth", async () => {
    const c = fresh();
    const { data: holdings } = await c.from("portfolio_holdings").select("isin");
    const isin = holdings![0]!.isin!;
    const { data: snaps } = await c
      .from("portfolio_snapshots")
      .select("snapshot_date,value_eur")
      .eq("isin", isin);
    const lastValue = snaps!.reduce((a, s) =>
      s.snapshot_date! > a.snapshot_date! ? s : a,
    ).value_eur!;
    const before = await latestTotal(c);

    const res = await (c.rpc as unknown as Rpc)("delete_holding", { p_kind: "stock", p_key: isin });
    expect(res).toEqual({ data: 1, error: null });
    expect((await c.from("portfolio_holdings").select("isin").eq("isin", isin)).data).toEqual([]);
    expect((await c.from("portfolio_snapshots").select("isin").eq("isin", isin)).data).toEqual([]);
    expect((await c.from("holding_trades").select("key").eq("key", isin)).data).toEqual([]);
    expect(await latestTotal(c)).toBeCloseTo(before - lastValue, 1);
  });

  it("removes one crypto source and returns 0 when there is nothing to delete", async () => {
    const c = fresh();
    const { data: coins } = await c.from("crypto_holdings").select("asset_symbol,source");
    const { asset_symbol, source } = coins![0]!;
    const del = () =>
      (c.rpc as unknown as Rpc)("delete_holding", {
        p_kind: "crypto",
        p_key: asset_symbol,
        p_source: source,
      });
    expect((await del()).data).toBe(1);
    expect(
      (
        await c
          .from("crypto_snapshots")
          .select("asset_symbol")
          .eq("asset_symbol", asset_symbol!)
          .eq("source", source!)
      ).data,
    ).toEqual([]);
    expect((await del()).data).toBe(0);
  });
});

describe("fake client: account types and debts", () => {
  const rpc = (c: ReturnType<typeof fresh>, f: string, a: object) =>
    (
      c.rpc as unknown as (
        f: string,
        a: object,
      ) => PromiseLike<{ data: unknown; error: { message: string } | null }>
    )(f, a);
  const today = async (c: ReturnType<typeof fresh>) => {
    const { data } = await c
      .from("v_net_worth_daily")
      .select("*")
      .order("snapshot_date", { ascending: false })
      .limit(1);
    return data![0]!;
  };

  // protects=the demo card is a debt: out of bank, subtracted from the total
  it("counts the demo credit card as a liability", async () => {
    const day = await today(fresh());
    expect(day.liabilities_eur).toBe(320);
    expect(day.total_eur).toBeCloseTo(
      day.bank_total_eur! + day.portfolio_total_eur! + day.crypto_total_eur! - 320,
      1,
    );
  });

  // protects=correcting a type moves the balance between bank and debts in net worth
  it("set_account_type moves the account between bank and liabilities", async () => {
    const c = fresh();
    const before = await today(c);
    expect(
      (await rpc(c, "set_account_type", { p_account: "demo-acc-card", p_type: "checking" })).error,
    ).toBeNull();
    const after = await today(c);
    expect(after.liabilities_eur).toBe(0);
    expect(after.bank_total_eur).toBeCloseTo(before.bank_total_eur! - 320, 1);
    expect(after.total_eur).toBeCloseTo(before.total_eur!, 1);
    const { data } = await c.from("v_bank_accounts_latest").select("*").eq("uid", "demo-acc-card");
    expect(data![0]!.account_type).toBe("checking");
    // Same debt-ness: net worth stays.
    await rpc(c, "set_account_type", { p_account: "demo-acc-main", p_type: "savings" });
    expect((await today(c)).total_eur).toBeCloseTo(after.total_eur!, 1);
  });

  it("set_account_type refuses an unknown type or account", async () => {
    const c = fresh();
    expect(
      (await rpc(c, "set_account_type", { p_account: "demo-acc-main", p_type: "boat" })).error
        ?.message,
    ).toBe("unknown account type");
    expect(
      (await rpc(c, "set_account_type", { p_account: "nope", p_type: "loan" })).error?.message,
    ).toBe("account not found");
  });

  // protects=a debt typed by hand shows in Accounts and lowers net worth; editing it follows
  it("add_manual_debt adds a loan, set_manual_balance changes what is owed", async () => {
    const c = fresh();
    const before = await today(c);
    const { data: uid, error } = await rpc(c, "add_manual_debt", {
      p_name: "Car loan",
      p_amount: 1000,
      p_currency: "EUR",
    });
    expect(error).toBeNull();
    const { data: rows } = await c
      .from("v_bank_accounts_latest")
      .select("*")
      .eq("uid", uid as string);
    expect(rows).toMatchObject([
      { label: "Car loan", account_type: "loan", manual: true, amount: 1000 },
    ]);
    expect((await today(c)).total_eur).toBeCloseTo(before.total_eur! - 1000, 1);
    expect(
      (await rpc(c, "set_manual_balance", { p_account: uid, p_amount: 400 })).error,
    ).toBeNull();
    const after = await today(c);
    expect(after.liabilities_eur).toBeCloseTo(before.liabilities_eur! + 400, 1);
    expect(after.total_eur).toBeCloseTo(before.total_eur! - 400, 1);
  });

  // protects=a deleted debt leaves the list and net worth
  it("delete_manual_debt removes the debt and its effect on net worth", async () => {
    const c = fresh();
    const before = await today(c);
    const { data: uid } = await rpc(c, "add_manual_debt", { p_name: "Loan", p_amount: 500 });
    expect((await rpc(c, "delete_manual_debt", { p_account: uid })).error).toBeNull();
    const { data } = await c
      .from("v_bank_accounts_latest")
      .select("*")
      .eq("uid", uid as string);
    expect(data).toHaveLength(0);
    expect((await today(c)).total_eur).toBeCloseTo(before.total_eur!, 1);
    expect((await rpc(c, "delete_manual_debt", { p_account: uid })).error?.message).toBe(
      "account not found",
    );
    expect(
      (await rpc(c, "delete_manual_debt", { p_account: "demo-acc-card" })).error?.message,
    ).toBe("not a manual debt");
  });

  it("add_manual_debt converts another currency at the demo rate", async () => {
    const c = fresh();
    const { data: uid } = await rpc(c, "add_manual_debt", {
      p_name: "US card",
      p_amount: 100,
      p_currency: "usd",
    });
    const { data: rows } = await c
      .from("v_bank_accounts_latest")
      .select("*")
      .eq("uid", uid as string);
    expect(rows![0]!.currency).toBe("USD");
    expect(rows![0]!.amount_eur).toBeGreaterThan(80);
    expect(rows![0]!.amount_eur).toBeLessThan(100);
  });

  it("refuses a debt with no name or amount, and a balance on a bank account", async () => {
    const c = fresh();
    expect((await rpc(c, "add_manual_debt", { p_name: " ", p_amount: 5 })).error?.message).toBe(
      "name is required",
    );
    expect((await rpc(c, "add_manual_debt", { p_name: "X" })).error?.message).toBe(
      "amount is required",
    );
    expect(
      (await rpc(c, "set_manual_balance", { p_account: "demo-acc-main", p_amount: 5 })).error
        ?.message,
    ).toBe("not a manual account");
    expect(
      (await rpc(c, "set_manual_balance", { p_account: "nope", p_amount: 5 })).error?.message,
    ).toBe("account not found");
  });
});

describe("fake client: add_manual_transaction", () => {
  type Rpc = (
    f: string,
    a: object,
  ) => PromiseLike<{
    data: Array<{ account_uid: string; entry_reference: string }>;
    error: unknown;
  }>;
  const add = (c: ReturnType<typeof fresh>, args: object) =>
    (c.rpc as unknown as Rpc)("add_manual_transaction", {
      p_booking_date: "2026-10-18",
      p_description: "Cena",
      p_amount: 45.5,
      p_direction: "DBIT",
      ...args,
    });

  it("adds a spend row that shows in the transactions view, on a manual account per source", async () => {
    const c = fresh();
    const { data, error } = await add(c, { p_source: "Fineco" });
    expect(error).toBeNull();
    const ref = data[0]!.entry_reference;
    const { data: rows } = await c
      .from("v_transactions_eur")
      .select("creditor_name,signed_amount_eur,flow_type,category")
      .eq("entry_reference", ref);
    expect(rows).toMatchObject([
      { creditor_name: "Cena", signed_amount_eur: -45.5, flow_type: "spend", category: null },
    ]);
    const { data: again } = await add(c, { p_source: "Fineco", p_description: "Pizza" });
    expect(again[0]!.account_uid).toBe(data[0]!.account_uid);
    const { data: accounts } = await c
      .from("accounts")
      .select("uid,bank_name,manual")
      .eq("uid", data[0]!.account_uid);
    expect(accounts).toMatchObject([
      { uid: data[0]!.account_uid, bank_name: "Fineco", manual: true },
    ]);
  });

  it("files a Transfer as a transfer and refuses an amount of zero", async () => {
    const c = fresh();
    const { data } = await add(c, { p_direction: "CRDT", p_category: "Transfer" });
    const { data: rows } = await c
      .from("v_transactions_eur")
      .select("flow_type")
      .eq("entry_reference", data[0]!.entry_reference);
    expect(rows).toMatchObject([{ flow_type: "transfer" }]);
    const { data: raw } = await c
      .from("transactions")
      .select("flow_source")
      .eq("entry_reference", data[0]!.entry_reference);
    expect(raw).toMatchObject([{ flow_source: "user" }]);
    const bad = await add(c, { p_amount: 0 });
    expect(bad.error).toBeTruthy();
  });
});

describe("fake client: parse-statement", () => {
  it("returns made-up statement rows in the shape the import expects", async () => {
    const c = fresh();
    const { data, error } = await (
      c.functions.invoke as unknown as (
        n: string,
        o: object,
      ) => Promise<{ data: { rows: Array<Record<string, unknown>> }; error: unknown }>
    )("parse-statement", { body: { pdf: "JVBERi0=" } });
    expect(error).toBeNull();
    expect(data.rows).toHaveLength(3);
    for (const r of data.rows) {
      expect(r["date"]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(["DBIT", "CRDT"]).toContain(r["direction"]);
    }
  });
});

describe("fake client: set_holding_quantity", () => {
  type Rpc = (f: string, a: object) => PromiseLike<{ data: number; error: unknown }>;
  it("selling a stock takes its value out of today's net worth at once", async () => {
    const c = fresh();
    const latest = async () => {
      const { data } = await c.from("v_net_worth_daily").select("snapshot_date,total_eur");
      return data!.reduce((a, r) => (r.snapshot_date! > a.snapshot_date! ? r : a)).total_eur!;
    };
    const { data: holdings } = await c.from("portfolio_holdings").select("isin");
    const isin = holdings![0]!.isin!;
    const { data: snaps } = await c
      .from("portfolio_snapshots")
      .select("snapshot_date,value_eur")
      .eq("isin", isin);
    const value = snaps!.reduce((a, s) => (s.snapshot_date! > a.snapshot_date! ? s : a)).value_eur!;
    const before = await latest();
    const res = await (c.rpc as unknown as Rpc)("set_holding_quantity", {
      p_kind: "stock",
      p_key: isin,
      p_quantity: 0,
    });
    expect(res).toEqual({ data: 1, error: null });
    expect(await latest()).toBeCloseTo(before - value, 1);
  });
});

describe("fake client: stream_action", () => {
  const setup = async () => {
    const c = fresh();
    const { data } = await c.from("recurring_streams").select("*");
    const rows = data as Array<Tables<"recurring_streams">>;
    const toReview = groupStreams(rows, NOW).toReview[0]!;
    return { c, toReview };
  };
  const act = (c: ReturnType<typeof fresh>, id: string, action: string, args = {}) =>
    c.rpc("stream_action", { p_stream: id, p_action: action, p_args: args });
  const grouped = async (c: ReturnType<typeof fresh>) =>
    groupStreams(
      ((await c.from("recurring_streams").select("*")).data ?? []) as Array<
        Tables<"recurring_streams">
      >,
      NOW,
    );

  it("confirm moves a suggestion to active; dismiss and undismiss round-trip", async () => {
    const { c, toReview } = await setup();
    expect((await act(c, toReview.id, "confirm")).error).toBeNull();
    expect((await grouped(c)).active.some((s) => s.id === toReview.id)).toBe(true);
    await act(c, toReview.id, "dismiss");
    expect((await grouped(c)).dismissed.some((s) => s.id === toReview.id)).toBe(true);
    await act(c, toReview.id, "undismiss");
    expect((await grouped(c)).toReview.some((s) => s.id === toReview.id)).toBe(true);
  });

  it("undismiss confirms a row that has no detected status", async () => {
    const { c, toReview } = await setup();
    await c.from("recurring_streams").update({ detected_status: null }).eq("id", toReview.id);
    await act(c, toReview.id, "dismiss");
    await act(c, toReview.id, "undismiss");
    expect((await grouped(c)).active.some((s) => s.id === toReview.id)).toBe(true);
  });

  it("set_cadence sets a cadence or a custom interval and confirms", async () => {
    const { c, toReview } = await setup();
    await act(c, toReview.id, "set_cadence", { cadence: "yearly" });
    await act(c, toReview.id, "set_cadence", { custom_value: 6, custom_unit: "weeks" });
    const row = (await grouped(c)).active.find((s) => s.id === toReview.id)!;
    expect([row.user_cadence, row.custom_interval_value, row.custom_interval_unit]).toEqual([
      "custom",
      6,
      "weeks",
    ]);
  });

  it("errors like the SQL raise on bad input", async () => {
    const { c, toReview } = await setup();
    for (const [action, args] of [
      ["set_cadence", { cadence: "daily" }],
      ["set_cadence", { custom_value: 0, custom_unit: "days" }],
      ["set_cadence", { custom_value: 2, custom_unit: "decades" }],
      ["explode", {}],
    ] as const)
      expect((await act(c, toReview.id, action, args)).error).not.toBeNull();
    expect((await act(c, "nope", "confirm")).error).not.toBeNull();
  });
});

describe("fake client: resolve_transfer_pair", () => {
  const sides = async (c: ReturnType<typeof fresh>) => {
    const { data: pairs } = await c.from("transfer_pairs").select("*").eq("status", "suggested");
    const pair = pairs![0]!;
    const { data: rows } = await c
      .from("transactions")
      .select("*")
      .in("entry_reference", [pair.out_ref, pair.in_ref]);
    return { pair, rows: rows! };
  };

  it("the demo has one suggested pair whose sides are transfers in two accounts", async () => {
    const { pair, rows } = await sides(fresh());
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.account_uid))).toEqual(
      new Set([pair.out_account_uid, pair.in_account_uid]),
    );
    expect(rows.every((r) => r.flow_type === "transfer" && r.flow_source === "pair")).toBe(true);
  });

  it("keep confirms the pair and locks both rows as the user's transfer", async () => {
    const c = fresh();
    const { pair } = await sides(c);
    expect(
      (await c.rpc("resolve_transfer_pair", { p_pair: pair.id, p_keep: true })).error,
    ).toBeNull();
    const { data } = await c.from("transfer_pairs").select("status").eq("id", pair.id);
    expect(data).toMatchObject([{ status: "confirmed" }]);
    const { data: rows } = await c
      .from("transactions")
      .select("*")
      .in("entry_reference", [pair.out_ref, pair.in_ref]);
    expect(rows!.map((r) => [r.flow_type, r.flow_source])).toEqual([
      ["transfer", "user"],
      ["transfer", "user"],
    ]);
  });

  it("not keeping puts each side back by direction; a settled pair can't be answered again", async () => {
    const c = fresh();
    const { pair } = await sides(c);
    await c.rpc("resolve_transfer_pair", { p_pair: pair.id, p_keep: false });
    const { data: rows } = await c
      .from("transactions")
      .select("*")
      .in("entry_reference", [pair.out_ref, pair.in_ref]);
    expect(rows!.map((r) => [r.credit_debit_indicator, r.flow_type, r.flow_source]).sort()).toEqual(
      [
        ["CRDT", "income", "user"],
        ["DBIT", "spend", "user"],
      ],
    );
    const again = await c.rpc("resolve_transfer_pair", { p_pair: pair.id, p_keep: true });
    expect(again.error).toBeTruthy();
  });

  it("refuses Keep once a side changed since the pairing", async () => {
    const c = fresh();
    const { pair } = await sides(c);
    await c.from("transactions").update({ flow_source: "user" }).eq("entry_reference", pair.in_ref);
    const res = await c.rpc("resolve_transfer_pair", { p_pair: pair.id, p_keep: true });
    expect(res.error).toBeTruthy();
    const { data } = await c.from("transfer_pairs").select("status").eq("id", pair.id);
    expect(data).toMatchObject([{ status: "suggested" }]);
  });
});
