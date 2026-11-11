import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// The Income page splits the month into Regular (a sender paying in 3+ of the last 6 months, or
// a rule says so) and One-off, and "Mark …" saves a rule for that name.

const db = vi.hoisted(() => ({
  window: [] as Array<Record<string, unknown>>,
  rules: [] as Array<Record<string, unknown>>,
  windowError: null as { message: string } | null,
  inserts: [] as Array<Record<string, unknown>>,
  updates: [] as Array<Record<string, unknown>>,
}));
const now = new Date();
const ym = (back: number) => {
  const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const bank = (ref: string, date: string, name: string) => ({
  account_uid: "a1",
  entry_reference: ref,
  booking_date: date,
  merchant_key: name.toLowerCase(),
  creditor_name: name,
  remittance_info: null,
  amount: 100,
  currency: "EUR",
});
const view = (ref: string, name: string, eur: number) => ({
  entry_reference: ref,
  account_uid: "a1",
  booking_date: `${ym(0)}-01`,
  category: "Income",
  creditor_name: name,
  currency: "EUR",
  amount: eur,
  signed_amount_eur: eur,
});

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: "u1" } } }) },
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "order", "eq", "gte", "lt", "in", "is", "or", "range", "delete"])
        q[m] = () => q;
      q["maybeSingle"] = () => Promise.resolve({ data: null, error: null });
      q["insert"] = (row: Record<string, unknown>) => {
        db.inserts.push(row);
        return q;
      };
      q["update"] = (row: Record<string, unknown>) => {
        db.updates.push(row);
        return q;
      };
      q["single"] = () => Promise.resolve({ data: { id: "new-rule" }, error: null });
      q["then"] = (resolve: (v: unknown) => void) =>
        resolve(
          table === "v_transactions_eur"
            ? {
                data: [view("e1", "ACME Ltd", 2000), view("e2", "Aunt May", 50)],
                error: null,
              }
            : table === "transactions"
              ? { data: db.windowError ? null : db.window, error: db.windowError }
              : table === "category_rules"
                ? { data: db.rules, error: null }
                : { data: [], error: null },
        );
      return q;
    },
  },
}));

import { toast } from "sonner";
import { Route } from "./income";

const Page = Route.options.component as () => React.JSX.Element;
const renderPage = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <Page />
    </QueryClientProvider>,
  );

beforeEach(() => {
  db.window = [
    bank("e1", `${ym(0)}-01`, "ACME Ltd"),
    bank("p1", `${ym(1)}-01`, "ACME Ltd"),
    bank("p2", `${ym(2)}-01`, "ACME Ltd"),
    bank("e2", `${ym(0)}-01`, "Aunt May"),
  ];
  db.rules = [];
  db.windowError = null;
  db.inserts = [];
  db.updates = [];
});

describe("Income: Regular and One-off", () => {
  it("puts a sender paying in 3 of the last 6 months under Regular, the rest under One-off", async () => {
    renderPage();
    const regular = await screen.findByRole("region", { name: "Regular" });
    expect(within(regular).getByText("ACME Ltd")).toBeTruthy();
    const oneOff = screen.getByRole("region", { name: "One-off" });
    expect(within(oneOff).getByText("Aunt May")).toBeTruthy();
    expect(
      screen.getByText((_, el) => el?.tagName === "P" && /^Regular /.test(el.textContent ?? ""))
        .textContent,
    ).toBe("Regular €2,000.00 · One-off €50.00");
  });

  it("follows a rule over the guess", async () => {
    db.rules = [
      {
        id: "r1",
        match_field: "creditor_name",
        match_text: "ACME Ltd",
        match_mode: "exact",
        set_income_kind: "one_off",
      },
    ];
    renderPage();
    const oneOff = await screen.findByRole("region", { name: "One-off" });
    expect(within(oneOff).getByText("ACME Ltd")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Regular" })).toBeNull();
  });

  it("saves an exact-name rule when you mark a row", async () => {
    renderPage();
    const oneOff = await screen.findByRole("region", { name: "One-off" });
    fireEvent.click(within(oneOff).getByRole("button", { name: "Mark regular" }));
    await vi.waitFor(() => expect(db.inserts).toHaveLength(1));
    expect(db.inserts[0]).toMatchObject({
      user_id: "u1",
      match_field: "creditor_name",
      match_text: "Aunt May",
      match_mode: "exact",
      set_category: null,
      set_income_kind: "regular",
    });
  });

  it("changes the rule that already decides the row instead of adding one", async () => {
    db.rules = [
      {
        id: "r1",
        match_field: "creditor_name",
        match_text: "acme",
        match_mode: "word",
        set_income_kind: "regular",
      },
    ];
    renderPage();
    const regular = await screen.findByRole("region", { name: "Regular" });
    fireEvent.click(within(regular).getByRole("button", { name: "Mark one-off" }));
    await vi.waitFor(() => expect(db.updates).toEqual([{ set_income_kind: "one_off" }]));
    expect(db.inserts).toEqual([]);
    // Polish #7: the rule may cover other names too, so the toast says which rule changed.
    await vi.waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "ACME Ltd now counts as one-off income",
        expect.objectContaining({ description: "Changed your rule for “acme”." }),
      ),
    );
  });

  it("keeps one list when the six months can't be read", async () => {
    db.windowError = { message: "boom" };
    renderPage();
    expect(await screen.findByText("Aunt May")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Regular" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Mark/ })).toBeNull();
  });
});
