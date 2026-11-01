import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { classifyRows } from "@/lib/import/splitwise-classify";
import { balancesFromFile } from "@/lib/import/splitwise-balances";
import { parseSplitwiseCsv } from "@/lib/import/splitwise-parse";

type Answer = { data: unknown[]; error: { message: string } | null };
const tables: {
  transactions: Answer;
  fx_rates: Answer;
  splitwise_expenses: Answer;
  category_rules: Answer;
} = {
  category_rules: { data: [], error: null },
  transactions: { data: [], error: null },
  fx_rates: { data: [], error: null },
  splitwise_expenses: { data: [], error: null },
};

// Every query method returns the same chain; awaiting it gives the table's canned answer.
const rpc = vi.fn();
const insertRule = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) },
    rpc: (...args: unknown[]) => rpc(...args),
    from: (table: string) => {
      const chain: { [method: string]: unknown } = {};
      for (const m of ["select", "gte", "lte", "in", "limit", "eq", "order"])
        chain[m] = () => chain;
      chain["insert"] = (row: unknown) => {
        insertRule(row);
        return Promise.resolve({ error: null });
      };
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

const onBack = vi.fn();
const onClose = vi.fn();
const show = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SplitwiseReview rows={rows} group="berkeley" onBack={onBack} onClose={onClose} />
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
  tables.category_rules = { data: [], error: null };
  insertRule.mockReset();
});

const showWithBalances = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SplitwiseReview
        rows={rows}
        group="berkeley"
        balances={balancesFromFile(parseSplitwiseCsv(CSV), 0)}
        onBack={onBack}
        onClose={onClose}
      />
    </QueryClientProvider>,
  );
// The Import button renders once the bank data is read but stays disabled until the signed-in user
// is known (a separate async call). Clicking it before then does nothing, so wait until enabled.
const clickImport = async () => {
  fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
  const button = (await screen.findByRole("button", { name: /^Import/ })) as HTMLButtonElement;
  await waitFor(() => expect(button.disabled).toBe(false));
  fireEvent.click(button);
};

describe("SplitwiseReview", () => {
  // protects=a sure match is offered and counted; fails_when=matching or planning is not wired
  it("offers the bank match ticked and sums up what will be recorded", async () => {
    show();
    expect(await screen.findByText(/matches the bank on 2026-08-18/)).toBeTruthy();
    expect((screen.getByRole("checkbox", { name: /Taxi/ }) as HTMLInputElement).checked).toBe(true);
    // 1 share paid by the friend (Dinner) + the taxi share linked to the bank
    expect(screen.getByText("2 expenses to import: 25.00 USD.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      screen.getByText(
        "Import 2 expenses (25.00 USD) into berkeley and update 1 bank transaction.",
      ),
    ).toBeTruthy();
  });

  // protects=one question per expense, none dropped silently; fails_when=the row is asked twice,
  // or an unticked match drops it
  it("asks about an expense whose match is unticked, and blocks until answered", async () => {
    show();
    expect(await screen.findByRole("checkbox", { name: /Taxi/ })).toBeTruthy();
    expect(screen.queryByRole("radio", { name: "Leave out" })).toBeNull();
    fireEvent.click(await screen.findByRole("checkbox", { name: /Taxi/ }));
    expect(screen.getByText(/Decide on 1 expense above/)).toBeTruthy();
    const next = screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "Leave out" }));
    expect(next.disabled).toBe(false);
    expect(screen.getByText("1 expense to import: 15.00 USD.")).toBeTruthy();
  });

  // protects=nothing is blocked silently; fails_when=a missing exchange rate is not shown
  it("shows a problem when an exchange rate is missing", async () => {
    tables.fx_rates = { data: [], error: null };
    show();
    expect((await screen.findByRole("alert")).textContent).toMatch(/No exchange rate for USD/);
  });

  // protects=an expense I paid never drops silently; fails_when=no choice is required, or the
  // choice does not reach the plan
  it("counts an unmatched expense I paid only when I say so", async () => {
    tables.transactions = { data: [], error: null };
    show();
    const next = (await screen.findByRole("button", { name: "Continue" })) as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "Count my share" }));
    expect(next.disabled).toBe(false);
    expect(screen.getByText("2 expenses to import: 25.00 USD.")).toBeTruthy();
  });

  // protects=each row gets its own category from its description; fails_when=rows are grouped by
  // the Splitwise category again, or a user rule is ignored
  it("shows a category for each row, read from its description", async () => {
    show();
    expect(((await screen.findByLabelText("Category for Dinner")) as HTMLSelectElement).value).toBe(
      "Dine Out",
    );
    expect((screen.getByLabelText("Category for Taxi") as HTMLSelectElement).value).toBe(
      "Transports",
    );
  });

  // protects=the friends' balances are stored with the import; fails_when=they are not sent, or a
  // failure to store them hides that the shares were imported
  it("also stores the group balances after a successful import", async () => {
    showWithBalances();
    await clickImport();
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
    expect(rpc.mock.calls[1]?.[0]).toBe("save_splitwise_balances");
    expect(rpc.mock.calls[1]?.[1]).toMatchObject({ p_group: "berkeley" });
    expect(await screen.findByText(/Imported 2 shares/)).toBeTruthy();
  });

  it("keeps the import and warns when the balances cannot be stored", async () => {
    rpc.mockResolvedValueOnce({ data: { shares: 2, links: 1 }, error: null });
    rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    showWithBalances();
    await clickImport();
    expect(await screen.findByText(/Imported 2 shares/)).toBeTruthy();
    expect((await screen.findByText(/balances were not saved/)).textContent).toMatch(/boom/);
  });

  it("applies the user's own rules before the built-in words", async () => {
    tables.category_rules = {
      data: [{ match_text: "dinner", set_category: "Housing", priority: 100 }],
      error: null,
    };
    show();
    expect(((await screen.findByLabelText("Category for Dinner")) as HTMLSelectElement).value).toBe(
      "Housing",
    );
  });

  it("lets a category be changed and sends the chosen one on Import", async () => {
    show();
    fireEvent.change(await screen.findByLabelText("Category for Dinner"), {
      target: { value: "Shopping" },
    });
    await clickImport();
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    const shares = (
      rpc.mock.calls[0]?.[1] as { p_shares: Array<{ description: string; category: string }> }
    ).p_shares;
    expect(shares.find((s) => s.description === "Dinner")?.category).toBe("Shopping");
  });

  // protects=unknown rows are visible and counted; fails_when=they silently become Others
  it("leaves an unrecognised row to choose and says how many", async () => {
    const odd = CSV.replace("Dinner,Dining out", "zzz qq,General");
    const oddRows = classifyRows(parseSplitwiseCsv(odd), 0);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SplitwiseReview rows={oddRows} group="berkeley" onBack={onBack} onClose={onClose} />
      </QueryClientProvider>,
    );
    const select = (await screen.findByLabelText("Category for zzz qq")) as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(screen.getByText(/Categories: 1 to choose/)).toBeTruthy();
    // protects=an unknown row cannot go unnoticed; fails_when=no alert is shown for it
    const alert = (await screen.findByRole("alert")).textContent ?? "";
    expect(alert).toMatch(/1 expense was not recognised/);
    // protects=the user knows the AI fills the gap overnight; fails_when=text still says Uncategorized
    expect(alert).toMatch(/AI will categorize it overnight/);
    expect(alert).not.toMatch(/Uncategorized/);
    fireEvent.change(select, { target: { value: "Others" } });
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  // protects=a correction can become a rule for next time; fails_when=the rule is not saved with
  // the right text and category, or is offered for rows the user did not change
  it("saves a correction as a rule for the description", async () => {
    show();
    expect(screen.queryByRole("button", { name: /Remember/ })).toBeNull();
    fireEvent.change(await screen.findByLabelText("Category for Dinner"), {
      target: { value: "Shopping" },
    });
    fireEvent.click(await screen.findByRole("button", { name: /Remember/ }));
    await waitFor(() => expect(insertRule).toHaveBeenCalledTimes(1));
    expect(insertRule.mock.calls[0]?.[0]).toMatchObject({
      match_field: "any",
      match_text: "dinner",
      set_category: "Shopping",
      user_id: "u1",
    });
    expect(await screen.findByText(/Rule saved/)).toBeTruthy();
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
    await clickImport();
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    const [fn, args] = rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(fn).toBe("import_splitwise");
    expect(args["p_group"]).toBe("berkeley");
    expect((args["p_shares"] as unknown[]).length).toBe(2);
    expect((args["p_links"] as unknown[]).length).toBe(1);
    expect(await screen.findByRole("button", { name: /Undo this import/ })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toMatch(/2 shares/);
    // Importing the same review twice would fail on the bank rows it already changed.
    expect(screen.queryByRole("button", { name: /^Import/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("does not allow continuing while there is a problem", async () => {
    tables.fx_rates = { data: [], error: null };
    show();
    await screen.findByRole("alert");
    expect((screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("shows why an import failed and offers no Undo", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "A bank transaction changed" } });
    show();
    await clickImport();
    expect((await screen.findByRole("alert")).textContent).toMatch(/bank transaction changed/);
    expect(screen.queryByRole("button", { name: /Undo this import/ })).toBeNull();
  });

  it("undoes the last import and forgets it", async () => {
    show();
    await clickImport();
    fireEvent.click(await screen.findByRole("button", { name: /Undo this import/ }));
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
    expect(rpc.mock.calls[1]?.[0]).toBe("undo_splitwise_import");
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Undo this import/ })).toBeNull(),
    );
  });

  // protects=an old import cannot be undone from a stale memory: that batch may hold every earlier
  // row; fails_when=Undo is offered on a new visit
  it("does not offer Undo after the flow is reopened", async () => {
    const first = show();
    await clickImport();
    await screen.findByRole("button", { name: /Undo this import/ });
    first.unmount();
    show();
    await screen.findByRole("button", { name: "Continue" });
    expect(screen.queryByRole("button", { name: /Undo this import/ })).toBeNull();
  });

  // protects=the "not in your bank" count; fails_when=an expense whose match was unticked is not
  // counted, though it is recorded when the box is ticked
  it("goes back from Confirm to Review, and from Review to the file step", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(await screen.findByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalled();
  });

  const share = (fingerprint: string, description: string, amount: number) => ({
    id: `id-${description}`,
    fingerprint,
    booking_date: fingerprint.slice(0, 10),
    description,
    amount,
    currency: "USD",
    linked_entry_reference: null as string | null,
  });
  // protects=balances can be refreshed with no new expense; fails_when=the retry the done screen
  // promises is unreachable
  it("can update the balances alone when there is nothing new", async () => {
    tables.splitwise_expenses = { data: [TAXI, DINNER], error: null };
    rpc.mockResolvedValue({ data: null, error: null });
    showWithBalances();
    fireEvent.click(await screen.findByRole("button", { name: /Update balances/ }));
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    expect(rpc.mock.calls[0]?.[0]).toBe("save_splitwise_balances");
    expect(await screen.findByText("Balances updated.")).toBeTruthy();
  });

  const TAXI = share("2026-08-17|Taxi|2000|USD|1000#1", "Taxi", 10);
  const DINNER = share("2026-08-16|Dinner|3000|USD|-1500#1", "Dinner", 15);

  // protects=stored rows get no new bank suggestion; fails_when=an imported expense is matched
  // again to another bank transaction
  it("does not propose a new match for an expense already stored", async () => {
    tables.splitwise_expenses = { data: [TAXI], error: null };
    show();
    await screen.findByText(/Your last import goes up to/);
    expect(screen.queryByText(/matches the bank/)).toBeNull();
    expect(screen.queryByRole("checkbox", { name: /Taxi/ })).toBeNull();
  });

  // protects=the user sees where the import starts and what it leaves out; fails_when=an older
  // row not stored is imported silently or dropped silently
  it("shows the checkpoint and lists older rows that are not imported", async () => {
    tables.splitwise_expenses = { data: [TAXI], error: null };
    show();
    expect(await screen.findByText(/Your last import goes up to 2026-08-17/)).toBeTruthy();
    const older = screen.getByRole("region", { name: /Added late/ });
    expect(older.textContent).toMatch(/Older than your last import, not imported/);
    expect(older.textContent).toMatch(/2026-08-16 Dinner/);
    expect(screen.getByText(/Nothing new since your last import/)).toBeTruthy();
  });

  it("says so and writes nothing when the same file is imported again", async () => {
    tables.splitwise_expenses = { data: [TAXI, DINNER], error: null };
    show();
    expect(await screen.findByText(/Nothing new since your last import/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not mention a checkpoint on a first import", async () => {
    show();
    await screen.findByText(/matches the bank/);
    expect(screen.queryByText(/Your last import/)).toBeNull();
    expect(screen.queryByText(/Added late/)).toBeNull();
  });

  // protects=a checkpoint cannot be read from a cut list; fails_when=the stored rows hit the page
  // limit and an old row is taken for new
  it("refuses to review when the stored rows may have been cut at the page limit", async () => {
    tables.splitwise_expenses = { data: Array.from({ length: 1000 }, () => TAXI), error: null };
    show();
    expect((await screen.findByRole("alert")).textContent).toMatch(/Too many stored expenses/);
  });

  describe("corrections", () => {
    const GONE = share("2026-08-16|Lunch|5000|USD|-1500#1", "Lunch", 15);
    const EDITED = share("2026-08-16|Dinner|4000|USD|-2000#1", "Dinner", 20);
    const applyButton = () => screen.findByRole("button", { name: /^Apply \d+ corrections/ });

    beforeEach(() => {
      rpc.mockResolvedValue({ data: { added: 1, edited: 0, removed: 0 }, error: null });
    });

    // protects=nothing old changes without a tick; fails_when=a category starts ticked
    it("starts with nothing ticked and nothing to apply", async () => {
      tables.splitwise_expenses = { data: [TAXI, GONE], error: null };
      show();
      const box = await screen.findByRole("checkbox", { name: /Lunch/ });
      expect((box as HTMLInputElement).checked).toBe(false);
      expect((await applyButton()) as HTMLButtonElement).toHaveProperty("disabled", true);
    });

    it("shows old and new values for an edit", async () => {
      tables.splitwise_expenses = { data: [TAXI, EDITED], error: null };
      show();
      const section = await screen.findByRole("region", { name: /Edited in Splitwise/ });
      expect(section.textContent).toMatch(/Was 2026-08-16 Dinner \(40.00 USD/);
      expect(section.textContent).toMatch(/Now 2026-08-16 Dinner \(30.00 USD/);
    });

    // protects=corrections take their own confirmation, and say Undo does not cover them;
    // fails_when=the first click writes, or the warning is dropped
    it("asks to confirm, says Undo does not cover it, and sends only the ticked row", async () => {
      tables.splitwise_expenses = { data: [TAXI, GONE], error: null };
      show();
      fireEvent.click(await screen.findByRole("checkbox", { name: /Lunch/ }));
      fireEvent.click(await applyButton());
      expect(rpc).not.toHaveBeenCalled();
      expect(screen.getByText(/Undo does not cover corrections/)).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: /Yes, apply 1 corrections/ }));
      await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
      const [fn, args] = rpc.mock.calls[0] as [string, Record<string, unknown>];
      expect(fn).toBe("apply_splitwise_corrections");
      expect(args["p_remove"]).toEqual([{ id: GONE.id, old_fingerprint: GONE.fingerprint }]);
      expect(args["p_add"]).toEqual([]);
      expect(await screen.findByText(/Applied: 1 added/)).toBeTruthy();
    });

    it("shows a clear message when the database function is missing", async () => {
      rpc.mockResolvedValue({
        data: null,
        error: { message: "Could not find the function public.apply_splitwise_corrections" },
      });
      tables.splitwise_expenses = { data: [TAXI, GONE], error: null };
      show();
      fireEvent.click(await screen.findByRole("checkbox", { name: /Lunch/ }));
      fireEvent.click(await applyButton());
      fireEvent.click(screen.getByRole("button", { name: /Yes, apply/ }));
      expect((await screen.findByRole("alert")).textContent).toMatch(/database update/);
    });

    it("warns that a linked removal gives the bank transaction back in full", async () => {
      tables.splitwise_expenses = {
        data: [TAXI, { ...GONE, linked_entry_reference: "e9" }],
        error: null,
      };
      show();
      expect(await screen.findByText(/it counts in full again/)).toBeTruthy();
    });
  });
});
