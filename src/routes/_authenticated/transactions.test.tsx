import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

let failTable: string | null = null;
// Rows the mocked views return (empty unless a test sets them).
const rows: Record<string, Array<Record<string, unknown>>> = {};
let tableData: Record<string, unknown> = {};
// Every select the page sends, to check which columns each query asks for.
const selects: Array<{ table: string; cols: string }> = [];
let rpcResult: { data: unknown; error: { message: string } | null } = { data: [], error: null };
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: () => Promise.resolve(rpcResult),
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      for (const m of [
        "select",
        "order",
        "eq",
        "neq",
        "gte",
        "lt",
        "lte",
        "is",
        "in",
        "not",
        "update",
        "maybeSingle",
      ]) {
        q[m] = () => q;
      }
      q["select"] = (cols: string) => {
        selects.push({ table, cols });
        return q;
      };
      q["then"] = (resolve: (v: unknown) => void) =>
        resolve(
          table === failTable
            ? { data: null, error: { message: "boom" } }
            : { data: table in tableData ? tableData[table] : (rows[table] ?? []), error: null },
        );
      return q;
    },
  },
}));

const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: vi.fn(),
  }),
}));

let searchParams: Record<string, string> = {};
const navigate = vi.fn();
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useSearch: () => searchParams,
  useNavigate: () => navigate,
}));

import { Route } from "./transactions";

const Page = Route.options.component as () => React.JSX.Element;
const renderPage = (client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) =>
  render(
    <QueryClientProvider client={client}>
      <Page />
    </QueryClientProvider>,
  );

afterEach(() => {
  toastSuccess.mockReset();
  navigate.mockReset();
  for (const k of Object.keys(rows)) delete rows[k];
});

// Polish pass 4 #1 and #14: Make a rule sits in the transaction's sheet (a phone's sheet covers
// the toast), and isn't offered when a loaded rule already sorts the name.
describe("Make a rule in the transaction sheet", () => {
  const today = new Date().toISOString().slice(0, 10);
  const bankRow = {
    entry_reference: "e1",
    account_uid: "a1",
    booking_date: today,
    category: "Shopping",
    creditor_name: "Poste Italiane",
    currency: "EUR",
    amount: 12.75,
    signed_amount_eur: -12.75,
    credit_debit_indicator: "DBIT",
    flow_type: "spend",
  };
  const openSheet = async (name: RegExp) => {
    const [card] = await screen.findAllByRole("button", { name });
    await userEvent.click(card!);
    return screen.findByRole("dialog");
  };

  it("offers it for a bank transaction", async () => {
    rows["v_transactions_eur"] = [bankRow];
    renderPage();
    const sheet = await openSheet(/Poste Italiane/);
    expect(within(sheet).getByRole("button", { name: "Make a rule" })).toBeTruthy();
  });

  // polish-1 #1 (#164): the sheet has its own history entry; pushing /rules on top of it left a
  // Back press that did nothing. fails_when=the sheet's Make a rule pushes instead of replacing
  it("opens Rules in place of the sheet's history entry", async () => {
    rows["v_transactions_eur"] = [bankRow];
    renderPage();
    const sheet = await openSheet(/Poste Italiane/);
    await userEvent.click(within(sheet).getByRole("button", { name: "Make a rule" }));
    expect(navigate).toHaveBeenLastCalledWith(
      expect.objectContaining({ to: "/rules", replace: true }),
    );
  });

  // pass5 #1: the rules come from the database, not only from a cache the Rules page filled
  it("leaves it out on a cold start when a saved rule already sorts the name", async () => {
    rows["v_transactions_eur"] = [bankRow];
    rows["category_rules"] = [
      {
        id: "r1",
        match_field: "creditor_name",
        match_text: "Poste",
        match_mode: "word",
        set_category: "Shopping",
        priority: 100,
      },
    ];
    renderPage();
    const sheet = await openSheet(/Poste Italiane/);
    await waitFor(() =>
      expect(within(sheet).queryByRole("button", { name: "Make a rule" })).toBeNull(),
    );
  });

  // Rules left-open #3: if the rules can't load, we can't tell the name is covered, so no button
  it("leaves it out when the rules fail to load", async () => {
    rows["v_transactions_eur"] = [bankRow];
    failTable = "category_rules";
    try {
      renderPage();
      const sheet = await openSheet(/Poste Italiane/);
      expect(within(sheet).queryByRole("button", { name: "Make a rule" })).toBeNull();
    } finally {
      failTable = null;
    }
  });

  // pass5 #2: the sheet's overlay covers the toast, so a change made in the sheet gets no toast
  // button (the sheet has its own); an inline change in the table keeps it
  it("puts Make a rule on the toast only when the change wasn't made in the sheet", async () => {
    rows["v_transactions_eur"] = [bankRow];
    renderPage();
    const sheet = await openSheet(/Poste Italiane/);
    await userEvent.click(within(sheet).getByRole("button", { name: /Change category for/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Groceries" }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    expect(toastSuccess.mock.calls.at(-1)?.[1]).not.toHaveProperty("action");
  });

  it("keeps Make a rule on the toast for an inline change in the table", async () => {
    rows["v_transactions_eur"] = [bankRow];
    renderPage();
    const [inline] = await screen.findAllByRole("button", { name: /Change category for/ });
    await userEvent.click(inline!);
    await userEvent.click(await screen.findByRole("button", { name: "Groceries" }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    expect(toastSuccess.mock.calls.at(-1)?.[1]).toHaveProperty("action.label", "Make a rule");
  });

  // polish-3 #1 (#164): toasts take clicks over an open sheet; the toast's Make a rule pushed
  // /rules on top of the sheet's history entry, leaving a Back that did nothing.
  // fails_when=the toast's action pushes while a sheet is open, or replaces when none is
  it("the toast's Make a rule replaces only while a sheet is open", async () => {
    rows["v_transactions_eur"] = [bankRow];
    renderPage();
    const [inline] = await screen.findAllByRole("button", { name: /Change category for/ });
    await userEvent.click(inline!);
    await userEvent.click(await screen.findByRole("button", { name: "Groceries" }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    const action = (toastSuccess.mock.calls.at(-1)?.[1] as { action: { onClick: () => void } })
      .action;
    action.onClick();
    expect(navigate).toHaveBeenLastCalledWith(expect.not.objectContaining({ replace: true }));
    await openSheet(/Poste Italiane/);
    action.onClick();
    expect(navigate).toHaveBeenLastCalledWith(
      expect.objectContaining({ to: "/rules", replace: true }),
    );
  });

  it("leaves it out for a Splitwise share", async () => {
    rows["v_splitwise_eur"] = [
      {
        id: "s1",
        booking_date: today,
        category: "Dine Out",
        description: "Dinner",
        group_name: "Trip",
        currency: "EUR",
        amount: 12.5,
        amount_eur: 12.5,
      },
    ];
    renderPage();
    const sheet = await openSheet(/Dinner/);
    expect(within(sheet).queryByRole("button", { name: "Make a rule" })).toBeNull();
  });
});

describe("Transactions page when an extra source fails to load", () => {
  // protects=a failed Splitwise or account query is reported, not shown as missing rows or labels;
  // fails_when=the page ignores the error state of its shares, accounts or transfers queries
  it.each(["v_splitwise_eur", "accounts"])("shows an error when %s fails", async (table) => {
    failTable = table;
    renderPage();
    expect((await screen.findByRole("alert")).textContent).toContain("boom");
    failTable = null;
  });

  it("shows no error when everything loads", async () => {
    renderPage();
    await screen.findAllByText(/No transactions for/);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

const thisMonth = (day: number) => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};
const row = (ref: string, over: Record<string, unknown> = {}) => ({
  entry_reference: ref,
  account_uid: "a1",
  booking_date: thisMonth(1),
  category: "Groceries",
  transaction_type: "One-time",
  creditor_name: `Shop ${ref}`,
  currency: "EUR",
  amount: 10,
  signed_amount_eur: -10,
  credit_debit_indicator: "DBIT",
  created_at: null,
  worth_it: null,
  personal_amount: null,
  owed_by: null,
  flow_type: "spend",
  refund_of: null,
  ...over,
});

// protects=the phone page answers "what happened" in the first viewport: month in/out line, day
// groups, and empty states that say why and offer the way out;
// fails_when=the in/out line is missing or shown without data, or an empty list is a dead end
describe("Activity page", () => {
  afterEach(() => {
    tableData = {};
  });

  it("shows the month's money in and out under the month", async () => {
    tableData = { v_income_vs_expenses_monthly: { income_eur: 2450, expenses_eur: 1382.34 } };
    renderPage();
    expect(await screen.findByText("€2,450.00")).toBeInTheDocument();
    expect(screen.getByText("€1,382.34")).toBeInTheDocument();
  });

  it("leaves the in/out line empty when the month has no figures", async () => {
    tableData = { v_income_vs_expenses_monthly: null };
    renderPage();
    await screen.findAllByText(/No transactions for/);
    expect(screen.queryByText(/^In /)).toBeNull();
  });

  it("titles the phone page Activity, like its tab, and the desktop page Transactions", () => {
    renderPage();
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent("Activity");
    expect(h1).toHaveTextContent("Transactions");
  });

  it("offers the previous month when this one is empty", async () => {
    renderPage();
    await screen.findAllByText(/No transactions for/);
    const label = () => document.querySelector("[aria-live]")?.textContent;
    const before = label();
    // The empty state's own button, not the switcher's icon button with the same label.
    await userEvent.click(screen.getAllByText("Previous month", { selector: "button" })[0]!);
    expect(label()).not.toBe(before);
  });

  it("groups the phone list by day", async () => {
    tableData = {
      v_transactions_eur: [row("1", { booking_date: thisMonth(2) }), row("2"), row("3")],
    };
    renderPage();
    const sections = await screen.findAllByRole("heading", { level: 2 });
    expect(sections.map((h) => h.textContent)).toHaveLength(2);
  });

  it("says when a search finds nothing, and clears it", async () => {
    tableData = { v_transactions_eur: [row("1")] };
    renderPage();
    await screen.findAllByText("Shop 1");
    await userEvent.type(screen.getByLabelText("Search by merchant or note"), "zzz");
    expect(screen.getAllByText("Nothing matches “zzz”.").length).toBeGreaterThan(0);
    await userEvent.click(screen.getAllByRole("button", { name: "Clear search" })[0]!);
    expect(screen.getAllByText("Shop 1").length).toBeGreaterThan(0);
  });

  it("says when filters hide everything, and clears them", async () => {
    tableData = { v_transactions_eur: [row("1"), row("2", { category: "Dine Out" })] };
    renderPage();
    await screen.findAllByText("Shop 1");
    await userEvent.selectOptions(screen.getByLabelText("Filter by category"), "Dine Out");
    await userEvent.type(screen.getByLabelText("Search by merchant or note"), "Shop 1");
    expect(screen.getAllByText("No transactions match your filters.").length).toBeGreaterThan(0);
    await userEvent.click(screen.getAllByRole("button", { name: "Clear filters" })[0]!);
    expect(screen.getAllByText("Shop 2").length).toBeGreaterThan(0);
  });

  it("shows the account badge only when the month spans more than one account", async () => {
    tableData = { v_transactions_eur: [row("1"), row("2", { account_uid: "a2" })] };
    const { unmount } = renderPage();
    await screen.findAllByText("Shop 1");
    expect(screen.getAllByTitle("Unknown account")).toHaveLength(2);
    unmount();
    tableData = { v_transactions_eur: [row("1"), row("2")] };
    renderPage();
    await screen.findAllByText("Shop 1");
    expect(screen.queryByTitle("Unknown account")).toBeNull();
  });
});

// protects=a Spending category row opens Activity on that category and month;
// fails_when=the route ignores ?category / ?month, or the month param is applied off by one
describe("Activity deep link", () => {
  afterEach(() => {
    tableData = {};
    searchParams = {};
  });

  it("opens on the linked month and category", async () => {
    tableData = { v_transactions_eur: [row("1"), row("2", { category: "Dine Out" })] };
    searchParams = { category: "Dine Out", month: "2026-03" };
    renderPage();
    expect(document.querySelector("[aria-live]")?.textContent).toBe("March 2026");
    expect((await screen.findAllByText("Shop 2")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Shop 1")).toBeNull();
  });

  it("opens on this month with every category without params", async () => {
    tableData = { v_transactions_eur: [row("1"), row("2", { category: "Dine Out" })] };
    renderPage();
    expect((await screen.findAllByText("Shop 1")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Shop 2").length).toBeGreaterThan(0);
  });

  it("validates its search params", () => {
    const validate = Route.options.validateSearch as (s: Record<string, unknown>) => unknown;
    expect(validate({ category: "Dine Out", month: "2026-03", junk: 1 })).toEqual({
      category: "Dine Out",
      month: "2026-03",
    });
    expect(validate({ category: 5, month: "2026-13" })).toEqual({});
  });
});

// protects=the tag filter keeps only rows with that tag; fails_when=the filter ignores tags
describe("Transactions page tag filter", () => {
  // protects=only the list that shows notes and tags fetches them;
  // fails_when=the transfers query also selects note and tags
  it("fetches note and tags for the month list only", async () => {
    selects.length = 0;
    renderPage();
    await screen.findAllByText(/No transactions for/);
    const views = selects.filter((s) => s.table === "v_transactions_eur").map((s) => s.cols);
    expect(views.length).toBeGreaterThan(1);
    expect(views.filter((c) => c.includes("note,tags"))).toHaveLength(1);
  });

  // protects=a failing tag-suggestions call is reported in the console, not hidden;
  // fails_when=fetchTagSuggestions swallows the error
  it("logs a failed suggestions call and still shows the page", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    rpcResult = { data: null, error: { message: "denied" } };
    renderPage();
    await screen.findAllByText(/No transactions for/);
    await waitFor(() =>
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining("tag suggestions"),
        expect.objectContaining({ message: "denied" }),
      ),
    );
    rpcResult = { data: [], error: null };
    log.mockRestore();
  });

  it("filters the month by tag", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const base = {
      account_uid: "a",
      booking_date: today,
      category: "Travel",
      currency: "EUR",
      amount: 10,
      signed_amount_eur: -10,
      credit_debit_indicator: "DBIT",
      flow_type: "spend",
    };
    rows["v_transactions_eur"] = [
      { ...base, entry_reference: "1", creditor_name: "Hotel Alpha", tags: ["trip"] },
      { ...base, entry_reference: "2", creditor_name: "Cafe Beta", tags: [] },
    ];
    renderPage();
    expect((await screen.findAllByText("Cafe Beta")).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("Filter by tag"), { target: { value: "trip" } });
    expect(screen.queryAllByText("Cafe Beta")).toHaveLength(0);
    expect(screen.getAllByText("Hotel Alpha").length).toBeGreaterThan(0);
  });

  // polish-3 #8: fails_when=the tag filter carries over to another month
  it("turns the tag filter off when the month changes", async () => {
    const today = new Date().toISOString().slice(0, 10);
    rows["v_transactions_eur"] = [
      {
        account_uid: "a",
        booking_date: today,
        category: "Travel",
        currency: "EUR",
        amount: 10,
        signed_amount_eur: -10,
        credit_debit_indicator: "DBIT",
        flow_type: "spend",
        entry_reference: "1",
        creditor_name: "Hotel Alpha",
        tags: ["trip"],
      },
    ];
    renderPage();
    fireEvent.change(await screen.findByLabelText("Filter by tag"), { target: { value: "trip" } });
    await userEvent.click(screen.getAllByRole("button", { name: "Previous month" })[0]!);
    expect(await screen.findByLabelText("Filter by tag")).toHaveValue("");
  });

  // fails_when=removing the last use of the selected tag leaves the filter on and the list empty
  it("turns the tag filter off when its tag is no longer used", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const base = {
      account_uid: "a",
      booking_date: today,
      category: "Travel",
      currency: "EUR",
      amount: 10,
      signed_amount_eur: -10,
      credit_debit_indicator: "DBIT",
      flow_type: "spend",
    };
    rows["v_transactions_eur"] = [
      { ...base, entry_reference: "1", creditor_name: "Hotel Alpha", tags: ["trip"] },
      { ...base, entry_reference: "2", creditor_name: "Cafe Beta", tags: ["work"] },
    ];
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderPage(client);
    fireEvent.change(await screen.findByLabelText("Filter by tag"), { target: { value: "trip" } });
    expect(screen.queryAllByText("Cafe Beta")).toHaveLength(0);
    rows["v_transactions_eur"] = [
      { ...base, entry_reference: "1", creditor_name: "Hotel Alpha", tags: [] },
      { ...base, entry_reference: "2", creditor_name: "Cafe Beta", tags: ["work"] },
    ];
    await act(() => client.invalidateQueries({ queryKey: ["transactions"] }));
    expect((await screen.findAllByText("Cafe Beta")).length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Filter by tag")).toHaveValue("");
  });

  // polish-5 #1: fails_when=the selected tag's spelling changes under it (Trip/trip) and the select
  // shows "All tags" while the list stays filtered
  it("keeps the tag filter showing its tag when the tag's spelling changes", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const base = {
      account_uid: "a",
      booking_date: today,
      category: "Travel",
      currency: "EUR",
      amount: 10,
      signed_amount_eur: -10,
      credit_debit_indicator: "DBIT",
      flow_type: "spend",
    };
    rows["v_transactions_eur"] = [
      { ...base, entry_reference: "1", creditor_name: "Hotel Alpha", tags: ["Trip"] },
      { ...base, entry_reference: "2", creditor_name: "Cafe Beta", tags: ["trip"] },
      { ...base, entry_reference: "3", creditor_name: "Bar Gamma", tags: ["trip"] },
      { ...base, entry_reference: "4", creditor_name: "Shop Delta", tags: [] },
    ];
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderPage(client);
    const select = await screen.findByLabelText("Filter by tag");
    fireEvent.change(select, { target: { value: "trip" } });
    rows["v_transactions_eur"] = [
      { ...base, entry_reference: "1", creditor_name: "Hotel Alpha", tags: ["Trip"] },
      { ...base, entry_reference: "2", creditor_name: "Cafe Beta", tags: [] },
      { ...base, entry_reference: "3", creditor_name: "Bar Gamma", tags: [] },
      { ...base, entry_reference: "4", creditor_name: "Shop Delta", tags: [] },
    ];
    await act(() => client.invalidateQueries({ queryKey: ["transactions"] }));
    await waitFor(() => expect(screen.queryAllByText("Cafe Beta")).toHaveLength(0));
    expect(screen.getByLabelText("Filter by tag")).toHaveValue("Trip");
    expect(screen.queryAllByText("Shop Delta")).toHaveLength(0);
  });

  // polish-4 #6: fails_when=a long tag stretches the desktop tag select and squeezes Search
  it("caps the desktop tag select's width", async () => {
    rows["v_transactions_eur"] = [
      {
        account_uid: "a",
        booking_date: new Date().toISOString().slice(0, 10),
        category: "Travel",
        currency: "EUR",
        amount: 10,
        signed_amount_eur: -10,
        credit_debit_indicator: "DBIT",
        flow_type: "spend",
        entry_reference: "1",
        creditor_name: "Hotel Alpha",
        tags: ["w".repeat(40)],
      },
    ];
    renderPage();
    expect(await screen.findByLabelText("Filter by tag")).toHaveClass("max-w-48", "truncate");
  });

  // polish-4 #2: fails_when=an edit that makes the row stop matching the filter closes its sheet
  it("keeps an open row's sheet while an edit takes it out of the filter", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const base = {
      account_uid: "a",
      booking_date: today,
      category: "Travel",
      currency: "EUR",
      amount: 10,
      signed_amount_eur: -10,
      credit_debit_indicator: "DBIT",
      flow_type: "spend",
    };
    rows["v_transactions_eur"] = [
      { ...base, entry_reference: "1", creditor_name: "Hotel Alpha", tags: ["trip"] },
      { ...base, entry_reference: "2", creditor_name: "Cafe Beta", tags: ["trip"] },
    ];
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderPage(client);
    fireEvent.change(await screen.findByLabelText("Filter by tag"), { target: { value: "trip" } });
    const [edit] = await screen.findAllByRole("button", { name: "Edit Hotel Alpha" });
    await userEvent.click(edit!);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    rows["v_transactions_eur"] = [
      { ...base, entry_reference: "1", creditor_name: "Hotel Alpha", tags: [] },
      { ...base, entry_reference: "2", creditor_name: "Cafe Beta", tags: ["trip"] },
    ];
    await act(() => client.invalidateQueries({ queryKey: ["transactions"] }));
    // The sheet's exit runs after the list re-renders, so give it a moment before checking.
    await act(() => new Promise((r) => setTimeout(r, 100)));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryAllByText("Hotel Alpha")).toHaveLength(0));
  });
});
