import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { classifyRows } from "@/lib/import/splitwise-classify";
import { parseSplitwiseCsv } from "@/lib/import/splitwise-parse";

type Answer = { data: unknown[]; error: { message: string } | null };
const tables: { transactions: Answer; fx_rates: Answer; splitwise_expenses: Answer } = {
  transactions: { data: [], error: null },
  fx_rates: { data: [], error: null },
  splitwise_expenses: { data: [], error: null },
};

// Every query method returns the same chain; awaiting it gives the table's canned answer.
const rpc = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) },
    rpc: (...args: unknown[]) => rpc(...args),
    from: (table: string) => {
      const chain: { [method: string]: unknown } = {};
      for (const m of ["select", "gte", "lte", "in", "limit", "eq"]) chain[m] = () => chain;
      chain["then"] = (resolve: (v: unknown) => unknown) =>
        resolve(tables[table as keyof typeof tables]);
      return chain;
    },
  },
}));

import { SplitwiseReview } from "./splitwise-review";

const CSV = [
  "Date,Description,Category,Cost,Currency,Ann,Bob",
  "",
  "2026-08-16,Dinner,Dining out,30.00,USD,-15.00,15.00",
  "2026-08-17,Taxi,Taxi,20.00,USD,10.00,-10.00",
  "",
  "2026-08-18,Total balance, , ,USD,-5.00,5.00",
].join("\n");
const rows = classifyRows(parseSplitwiseCsv(CSV), 0);

const show = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SplitwiseReview rows={rows} group="berkeley" />
    </QueryClientProvider>,
  );

const bankRow = {
  account_uid: "acc",
  entry_reference: "e1",
  booking_date: "2026-08-18",
  amount: 18.4,
  currency: "EUR",
  credit_debit_indicator: "DBIT",
  personal_amount: null,
  flow_type: null,
  deleted_at: null,
};

beforeEach(() => {
  localStorage.clear();
  rpc.mockReset();
  rpc.mockResolvedValue({ data: { shares: 2, links: 1 }, error: null });
  tables.transactions = { data: [bankRow], error: null };
  tables.fx_rates = {
    data: [{ currency: "USD", date: "2026-08-10", rate_to_eur: 0.92 }],
    error: null,
  };
  tables.splitwise_expenses = { data: [], error: null };
});

describe("SplitwiseReview", () => {
  // protects=a sure match is offered and counted; fails_when=matching or planning is not wired
  it("offers the bank match ticked and counts what will be recorded", async () => {
    show();
    expect(await screen.findByText(/matches the bank on 2026-08-18/)).toBeTruthy();
    expect((screen.getByRole("checkbox", { name: /Taxi/ }) as HTMLInputElement).checked).toBe(true);
    // 1 share paid by the friend (Dinner) + the taxi share linked to the bank
    expect(screen.getByText(/2 shares of expenses, 1 bank transactions updated/)).toBeTruthy();
  });

  it("stops counting the bank change when the match is unticked", async () => {
    show();
    fireEvent.click(await screen.findByRole("checkbox", { name: /Taxi/ }));
    expect(screen.getByText(/1 shares of expenses, 0 bank transactions updated/)).toBeTruthy();
  });

  // protects=nothing is blocked silently; fails_when=a missing exchange rate is not shown
  it("shows a problem when an exchange rate is missing", async () => {
    tables.fx_rates = { data: [], error: null };
    show();
    expect((await screen.findByRole("alert")).textContent).toMatch(/No exchange rate for USD/);
  });

  it("offers the unmatched expenses I paid only after a tick", async () => {
    tables.transactions = { data: [], error: null };
    show();
    fireEvent.click(await screen.findByRole("checkbox", { name: /Also count the 1 expenses/ }));
    expect(screen.getByText(/2 shares of expenses, 0 bank transactions updated/)).toBeTruthy();
  });

  it("lets the category be changed", async () => {
    show();
    const select = (await screen.findByLabelText("Dining out")) as HTMLSelectElement;
    expect(select.value).toBe("Dine Out");
    fireEvent.change(select, { target: { value: "Shopping" } });
    expect(select.value).toBe("Shopping");
  });

  it("shows a database error", async () => {
    tables.transactions = { data: [], error: { message: "boom" } };
    show();
    expect((await screen.findByRole("alert")).textContent).toBe("boom");
  });

  it("refuses a result that may have been cut at the page limit", async () => {
    tables.transactions = { data: Array.from({ length: 1000 }, () => bankRow), error: null };
    show();
    expect((await screen.findByRole("alert")).textContent).toMatch(/Too many bank transactions/);
  });

  // protects=Import sends exactly the reviewed plan once; fails_when=a blocked plan is sent,
  // the call is repeated or the result is not shown
  it("sends the reviewed plan on Import and offers Undo", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: /^Import/ }));
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    const [fn, args] = rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(fn).toBe("import_splitwise");
    expect(args["p_group"]).toBe("berkeley");
    expect((args["p_shares"] as unknown[]).length).toBe(2);
    expect((args["p_links"] as unknown[]).length).toBe(1);
    expect(await screen.findByRole("button", { name: /Undo this import/ })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toMatch(/2 shares/);
    // Importing the same review twice would fail on the bank rows it already changed.
    expect((screen.getByRole("button", { name: /^Import/ }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("does not allow Import while there is a problem", async () => {
    tables.fx_rates = { data: [], error: null };
    show();
    await screen.findByRole("alert");
    expect((screen.getByRole("button", { name: /^Import/ }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("shows why an import failed and offers no Undo", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "A bank transaction changed" } });
    show();
    fireEvent.click(await screen.findByRole("button", { name: /^Import/ }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/bank transaction changed/);
    expect(screen.queryByRole("button", { name: /Undo this import/ })).toBeNull();
  });

  it("undoes the last import and forgets it", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: /^Import/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Undo this import/ }));
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
    expect(rpc.mock.calls[1]?.[0]).toBe("undo_splitwise_import");
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Undo this import/ })).toBeNull(),
    );
  });

  it("offers Undo again after the page is reopened", async () => {
    const first = show();
    fireEvent.click(await screen.findByRole("button", { name: /^Import/ }));
    await screen.findByRole("button", { name: /Undo this import/ });
    first.unmount();
    show();
    expect(await screen.findByRole("button", { name: /Undo this import/ })).toBeTruthy();
  });

  // protects=the "not in your bank" count; fails_when=an expense whose match was unticked is not
  // counted, though it is recorded when the box is ticked
  it("counts an expense with an unticked match as not in the bank", async () => {
    show();
    fireEvent.click(await screen.findByRole("checkbox", { name: /Taxi/ }));
    const box = await screen.findByRole("checkbox", { name: /Also count the 1 expenses/ });
    fireEvent.click(box);
    expect(screen.getByText(/2 shares of expenses, 0 bank transactions updated/)).toBeTruthy();
  });
});
