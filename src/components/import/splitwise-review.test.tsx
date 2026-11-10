import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
const onImported = vi.fn();
const show = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SplitwiseReview rows={rows} group="berkeley" onBack={onBack} onImported={onImported} />
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
  creditor_name: "Yellow Cab",
};

// polish-3 #5: dates show without a year only in the current year, so pin "today".
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-10T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

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
  onImported.mockReset();
});

const showWithBalances = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SplitwiseReview
        rows={rows}
        group="berkeley"
        balances={balancesFromFile(parseSplitwiseCsv(CSV), 0)}
        onBack={onBack}
        onImported={onImported}
      />
    </QueryClientProvider>,
  );
// The Import button renders once the bank data is read but stays disabled until the signed-in user
// is known (a separate async call). Clicking it before then does nothing, so wait until enabled.
const importButton = () => screen.findByRole("button", { name: /^Import \d/ });
const clickImport = async () => {
  const button = (await importButton()) as HTMLButtonElement;
  await waitFor(() => expect(button.disabled).toBe(false));
  fireEvent.click(button);
};

describe("SplitwiseReview", () => {
  // protects=a sure match is offered and counted; fails_when=matching or planning is not wired
  it("offers the bank match switched on and sums up what will be recorded", async () => {
    show();
    const match = (await screen.findByRole("switch", { name: /Taxi/ })) as HTMLInputElement;
    expect(match.checked).toBe(true);
    expect(screen.getByText(/Yellow Cab/)).toBeTruthy();
    // 1 share paid by the friend (Dinner) + the taxi share linked to the bank
    expect(screen.getByRole("heading", { name: "2 expenses" })).toBeTruthy();
    expect(screen.getByText(/Your share US\$25.00/)).toBeTruthy();
    expect(((await importButton()) as HTMLButtonElement).textContent).toBe("Import 2 expenses");
  });

  // protects=one question per expense, none dropped silently; fails_when=the row is asked twice,
  // or an unticked match drops it
  it("asks about an expense whose match is switched off, and blocks until answered", async () => {
    show();
    const match = await screen.findByRole("switch", { name: /Taxi/ });
    expect(screen.queryByRole("button", { name: "Skip" })).toBeNull();
    fireEvent.click(match);
    const blocked = screen.getByRole("button", {
      name: "Decide on 1 expense to continue",
    }) as HTMLButtonElement;
    expect(blocked.disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.getByText(/Skipped: not counted/)).toBeTruthy();
    expect(screen.getByText(/Your share US\$15.00/)).toBeTruthy();
    expect(((await importButton()) as HTMLButtonElement).disabled).toBe(false);
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
    const blocked = (await screen.findByRole("button", {
      name: "Decide on 1 expense to continue",
    })) as HTMLButtonElement;
    expect(blocked.disabled).toBe(true);
    expect(screen.getByText(/isn't in your bank yet/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Paid in cash" }));
    expect(screen.getByText(/your share counts/)).toBeTruthy();
    expect(((await importButton()) as HTMLButtonElement).textContent).toBe("Import 2 expenses");
    // Change brings the three choices back.
    fireEvent.click(screen.getByRole("button", { name: /Change what to do with Taxi/ }));
    expect(screen.getByRole("button", { name: "Paid in cash" })).toBeTruthy();
  });

  // protects=a payment the matcher missed can be linked by hand, with my part = bank amount minus
  // what the others owe; fails_when=the link is not sent, or the amount uses another rule
  it("links an expense to a bank payment picked by hand", async () => {
    // 50 EUR paid; Splitwise says 20 USD, others owe 10 USD = 9.20 EUR. My part: 40.80 EUR.
    tables.transactions = {
      data: [{ ...bankRow, amount: 50, booking_date: "2026-08-19" }],
      error: null,
    };
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Find in bank" }));
    expect(await screen.findByText("Which payment was Taxi?")).toBeTruthy();
    const link = screen.getByRole("button", { name: "Link payment" }) as HTMLButtonElement;
    expect(link.disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: /Yellow Cab/ }));
    expect(screen.getByText("−€9.20")).toBeTruthy();
    expect(screen.getByText("€40.80")).toBeTruthy();
    fireEvent.click(link);
    expect(await screen.findByText(/Linked to Yellow Cab/)).toBeTruthy();
    await clickImport();
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    const args = rpc.mock.calls[0]?.[1] as { p_links: Array<Record<string, unknown>> };
    expect(args.p_links).toEqual([
      {
        account_uid: "acc",
        entry_reference: "e1",
        action: "set_personal_amount",
        personal_amount: 40.8,
      },
    ]);
  });

  it("says when there is no payment to pick around that date", async () => {
    tables.transactions = { data: [], error: null };
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Find in bank" }));
    expect(await screen.findByText(/No payments out of your accounts/)).toBeTruthy();
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
    await waitFor(() =>
      expect(onImported).toHaveBeenCalledWith(expect.objectContaining({ balancesError: null })),
    );
  });

  it("keeps the import and warns when the balances cannot be stored", async () => {
    rpc.mockResolvedValueOnce({ data: { shares: 2, links: 1 }, error: null });
    rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    showWithBalances();
    await clickImport();
    await waitFor(() =>
      expect(onImported).toHaveBeenCalledWith(
        expect.objectContaining({ shares: 2, balancesError: "boom" }),
      ),
    );
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
        <SplitwiseReview rows={oddRows} group="berkeley" onBack={onBack} />
      </QueryClientProvider>,
    );
    const select = (await screen.findByLabelText("Category for zzz qq")) as HTMLSelectElement;
    expect(select.value).toBe("");
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

  // protects=Import sends exactly the reviewed plan once and hands the batch to the page, which
  // offers Undo; fails_when=a blocked plan is sent, the call is repeated or the batch is lost
  it("sends the reviewed plan on Import and hands back the batch", async () => {
    show();
    await clickImport();
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    const [fn, args] = rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(fn).toBe("import_splitwise");
    expect(args["p_group"]).toBe("berkeley");
    expect((args["p_shares"] as unknown[]).length).toBe(2);
    expect((args["p_links"] as unknown[]).length).toBe(1);
    await waitFor(() =>
      expect(onImported).toHaveBeenCalledWith({
        batchId: args["p_batch"],
        group: "berkeley",
        shares: 2,
        balancesError: null,
      }),
    );
  });

  it("does not allow importing while there is a problem", async () => {
    tables.fx_rates = { data: [], error: null };
    show();
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Paid in cash" }));
    expect(((await importButton()) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows why an import failed and stays on the review", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "A bank transaction changed" } });
    show();
    await clickImport();
    expect((await screen.findByRole("alert")).textContent).toMatch(/bank transaction changed/);
    expect(onImported).not.toHaveBeenCalled();
  });

  it("goes back to the file step", async () => {
    show();
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

  it("says when rows in another currency are left out of who owes you", async () => {
    const balances = { ...balancesFromFile(parseSplitwiseCsv(CSV), 0)!, skippedRows: 2 };
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SplitwiseReview rows={rows} group="berkeley" balances={balances} onBack={onBack} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/2 rows are in another currency than USD/)).toBeTruthy();
  });

  const TAXI = share("2026-08-17|Taxi|2000|USD|1000#1", "Taxi", 10);
  const DINNER = share("2026-08-16|Dinner|3000|USD|-1500#1", "Dinner", 15);

  // protects=an expense waiting for a decision is never hidden behind "Nothing new";
  // fails_when=the only new row is one I paid with no bank match and the Import button disappears
  it("asks about a new expense I paid even when it is the only new one", async () => {
    tables.splitwise_expenses = { data: [DINNER], error: null };
    tables.transactions = { data: [], error: null };
    show();
    expect(
      await screen.findByRole("button", { name: "Decide on 1 expense to continue" }),
    ).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Nothing new" })).toBeNull();
  });

  // protects=one payment is never linked to two rows; fails_when=a suggested payment (even
  // switched off) can also be picked by hand for the same or another expense
  it("does not offer a suggested payment in Find in bank", async () => {
    show();
    fireEvent.click(await screen.findByRole("switch", { name: /Taxi/ }));
    fireEvent.click(screen.getByRole("button", { name: "Find in bank" }));
    expect(await screen.findByText(/No payments out of your accounts/)).toBeTruthy();
  });

  // protects=stored rows get no new bank suggestion; fails_when=an imported expense is matched
  // again to another bank transaction
  it("does not propose a new match for an expense already stored", async () => {
    tables.splitwise_expenses = { data: [TAXI], error: null };
    show();
    await screen.findByRole("heading", { name: "Nothing new" });
    expect(screen.queryByRole("switch", { name: /Taxi/ })).toBeNull();
  });

  // protects=the user sees where the import starts and what it leaves out; fails_when=an older
  // row not stored is imported silently or dropped silently
  it("shows the checkpoint and lists older rows that are not imported", async () => {
    tables.splitwise_expenses = { data: [TAXI], error: null };
    show();
    expect(await screen.findByText(/Everything up to 17 Aug is already imported/)).toBeTruthy();
    const toggle = screen.getByRole("button", { name: /Changes to earlier imports/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("region", { name: /Added late/ })).toBeNull();
    fireEvent.click(toggle);
    const older = screen.getByRole("region", { name: /Added late/ });
    expect(older.textContent).toMatch(/Older than your last import, not imported/);
    expect(older.textContent).toMatch(/Dinner.*16 Aug/);
    expect(screen.getByRole("heading", { name: "Nothing new" })).toBeTruthy();
  });

  it("says so and writes nothing when the same file is imported again", async () => {
    tables.splitwise_expenses = { data: [TAXI, DINNER], error: null };
    show();
    expect(await screen.findByRole("heading", { name: "Nothing new" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Import/ })).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not mention a checkpoint on a first import", async () => {
    show();
    await screen.findByRole("switch", { name: /Taxi/ });
    expect(screen.queryByText(/already imported|New since/)).toBeNull();
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
    const openChanges = async () =>
      fireEvent.click(await screen.findByRole("button", { name: /Changes to earlier imports/ }));

    beforeEach(() => {
      rpc.mockResolvedValue({ data: { added: 1, edited: 0, removed: 0 }, error: null });
    });

    // protects=nothing old changes without a tick; fails_when=a category starts ticked
    it("starts with nothing ticked and nothing to apply", async () => {
      tables.splitwise_expenses = { data: [TAXI, GONE], error: null };
      show();
      await openChanges();
      const box = await screen.findByRole("checkbox", { name: /Lunch/ });
      expect((box as HTMLInputElement).checked).toBe(false);
      expect((await applyButton()) as HTMLButtonElement).toHaveProperty("disabled", true);
    });

    it("shows old and new values for an edit", async () => {
      tables.splitwise_expenses = { data: [TAXI, EDITED], error: null };
      show();
      await openChanges();
      const section = await screen.findByRole("region", { name: /Edited in Splitwise/ });
      expect(section.textContent).toMatch(/was US\$40.00 total/);
      expect(section.textContent).toMatch(/now US\$30.00 total/);
    });

    // protects=corrections take their own confirmation, and say Undo does not cover them;
    // fails_when=the first click writes, or the warning is dropped
    it("asks to confirm, says Undo does not cover it, and sends only the ticked row", async () => {
      tables.splitwise_expenses = { data: [TAXI, GONE], error: null };
      show();
      await openChanges();
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
      await openChanges();
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
      await openChanges();
      expect(await screen.findByText(/it counts in full again/)).toBeTruthy();
    });
  });
});
