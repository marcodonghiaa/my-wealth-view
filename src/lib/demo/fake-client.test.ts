import { describe, expect, it, vi } from "vitest";
import { createFakeClient } from "./fake-client";
import { DEMO_USER_ID } from "./generate";

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
    expect(counted.count).toBe(2);
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

  it("a new CD holding appears in its view; a fresh client forgets every edit", async () => {
    const c = fresh();
    await c.from("cd_holdings").delete().neq("id", "");
    expect((await c.from("v_cd_holdings").select("*")).data).toHaveLength(0);
    expect((await fresh().from("v_cd_holdings").select("*")).data!.length).toBeGreaterThan(0);
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

  it("refuses database functions that would import data", async () => {
    const { error } = await fresh().rpc("import_splitwise", {} as never);
    expect(error?.message).toMatch(/demo/i);
  });
});
