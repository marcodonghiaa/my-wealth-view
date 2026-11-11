import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const rows = vi.hoisted(() => ({
  v_bank_accounts_latest: [] as Array<Record<string, unknown>>,
}));
const invoke = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  loading: vi.fn(() => "t1"),
  dismiss: vi.fn(),
}));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/integrations/supabase/client", () => {
  const query = (table: string) => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "order", "eq"]) q[m] = () => q;
    q["then"] = (resolve: (v: unknown) => void) =>
      resolve({ data: rows[table as keyof typeof rows] ?? [], error: null });
    return q;
  };
  return { supabase: { from: query, functions: { invoke } } };
});
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  Link: ({ children }: { children: React.ReactNode }) => <a href="/import">{children}</a>,
}));

import { Route } from "./accounts";

const Page = Route.options.component as () => React.JSX.Element;

describe("debts", () => {
  afterEach(() => {
    rows.v_bank_accounts_latest = [];
  });
  const account = (over: Record<string, unknown>) => ({
    uid: "a1",
    label: "Demo Bank Current",
    iban: null,
    currency: "EUR",
    snapshot_date: "2026-10-19",
    amount: 1000,
    amount_eur: 1000,
    consent_valid_until: null,
    bank_name: "Demo Bank",
    account_type: null,
    manual: false,
    ...over,
  });
  const renderPage = () =>
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Page />
      </QueryClientProvider>,
    );

  // protects=the page stays light: no Debts group (and no type picker) until a debt exists
  it("shows no Debts group without debts, only an Add a debt button", async () => {
    rows.v_bank_accounts_latest = [account({})];
    renderPage();
    expect(await screen.findByRole("button", { name: "Add a debt" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Debts" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  // protects=a card counts as money owed, whatever sign the bank uses; fails_when=it adds to cash
  it("groups cards and loans under Debts, negative, and takes them off the total", async () => {
    rows.v_bank_accounts_latest = [
      account({}),
      account({
        uid: "c1",
        label: "Card",
        account_type: "credit_card",
        amount: 200,
        amount_eur: 200,
      }),
      account({
        uid: "l1",
        label: "Car loan",
        bank_name: "Car loan",
        account_type: "loan",
        manual: true,
        amount: 300,
        amount_eur: 300,
      }),
    ];
    renderPage();
    expect(await screen.findByRole("heading", { name: "Debts" })).toBeInTheDocument();
    expect(screen.getByText("Car loan")).toBeInTheDocument();
    expect(screen.getAllByText("-€500.00").length).toBeGreaterThan(0);
    // Bank accounts keep only the cash account.
    expect(screen.getAllByText("€1,000.00").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Add a debt" })).toBeInTheDocument();
  });
});

describe("connect a bank", () => {
  beforeEach(() => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["pl-PL"]);
  });
  afterEach(() => vi.restoreAllMocks());

  // protects=a browser language outside the list asks for a country; fails_when=en-US browsers
  // start on Austria, the first country A-Z, and load its banks (polish 4, P2-3)
  it("asks for a country when the browser language names none in the list", async () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["en-US"]);
    invoke.mockClear();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Page />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Connect a bank" }));
    expect(screen.getByLabelText("Country")).toHaveValue("");
    expect(screen.getByRole("option", { name: "Choose a country…" })).toBeInTheDocument();
    expect(screen.getByLabelText("Bank")).toBeDisabled();
    expect(screen.getByRole("option", { name: "Choose a country first" })).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith("list-banks", expect.anything());
  });

  // protects=the country picker opens on the browser's country; fails_when=the form ignores
  // navigator.languages and always starts on the first country
  it("starts on the country of the browser language", async () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["pl-PL", "en"]);
    invoke.mockResolvedValue({ data: { banks: [] }, error: null });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Page />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Connect a bank" }));
    expect(screen.getByLabelText("Country")).toHaveValue("PL");
  });

  // protects=a failed bank list says so, is announced and can be retried; fails_when=the disabled
  // select still reads "Select a bank…" and only changing country tries again (polish 5, item 4)
  it("says the bank list failed and retries it", async () => {
    invoke.mockResolvedValue({ data: { error: "Bank list unavailable" }, error: null });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Page />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Connect a bank" }));
    expect(await screen.findByRole("alert", {}, { timeout: 4000 })).toHaveTextContent(
      "Bank list unavailable",
    );
    expect(screen.getByRole("option", { name: "Couldn't load banks" })).toBeInTheDocument();
    invoke.mockResolvedValue({
      data: { banks: [{ name: "Sample Bank", logo: null }] },
      error: null,
    });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("option", { name: "Sample Bank" })).toBeInTheDocument();
  });

  // protects=Renew says when the saved bank is gone from the list; fails_when=the bank select
  // silently falls back to "Select a bank…" with Approve disabled (polish 5, item 5)
  it("says when the bank to renew is no longer listed", async () => {
    const soon = new Date(Date.now() + 3 * 86_400_000).toISOString();
    rows.v_bank_accounts_latest = [
      {
        uid: "a1",
        label: "Gone Bank Current",
        iban: null,
        currency: "EUR",
        snapshot_date: "2026-10-19",
        amount: 1000,
        amount_eur: 1000,
        consent_valid_until: soon,
        bank_name: "Gone Bank",
        bank_country: "LT",
        account_type: null,
        manual: false,
      },
    ];
    invoke.mockResolvedValue({
      data: { banks: [{ name: "Other Bank", logo: null }] },
      error: null,
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Page />
      </QueryClientProvider>,
    );
    Element.prototype.scrollIntoView = vi.fn(); // jsdom has none; Renew scrolls to the form
    fireEvent.click(await screen.findByRole("button", { name: "Renew access" }));
    expect(
      await screen.findByText(
        "Gone Bank isn't listed for this country anymore. Pick your bank again.",
      ),
    ).toBeInTheDocument();
    rows.v_bank_accounts_latest = [];
  });

  // protects=long country names ("United Kingdom") stay readable; fails_when=the country select
  // gets a fixed width again, which clipped "United Kingdom" at 640-767px (polish 4, P1-1)
  it("sizes the country select to its longest name, not a fixed width", async () => {
    invoke.mockResolvedValue({ data: { banks: [] }, error: null });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Page />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Connect a bank" }));
    expect(screen.getByLabelText("Country").className).not.toMatch(/(^|\s)(sm:)?w-\d/);
  });

  // protects=a country with no supported banks says so; fails_when=the bank list sits empty on
  // "Select a bank…" with submit disabled and no reason
  it("says when a country has no banks", async () => {
    invoke.mockResolvedValue({ data: { banks: [] }, error: null });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Page />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Connect a bank" }));
    expect(
      await screen.findByRole("option", { name: "No banks for this country" }),
    ).toBeInTheDocument();
  });

  // protects=the empty bank list is announced and says what to do; fails_when=the only sign is
  // the placeholder of a closed, still-enabled select (polish 4, P2-2)
  it("announces an empty bank list with a next step and disables the bank select", async () => {
    invoke.mockResolvedValue({ data: { banks: [] }, error: null });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Page />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Connect a bank" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "No banks listed for this country yet. Try another country.",
    );
    expect(screen.getByLabelText("Bank")).toBeDisabled();
  });
});

describe("bank redirect with a one-time code", () => {
  const state = "6f1c2a7e-0b5d-4c3e-9a8f-1d2e3f4a5b6c";
  beforeEach(() => {
    invoke.mockReset();
    toast.success.mockClear();
    toast.error.mockClear();
    window.history.replaceState(null, "", `/accounts?bank_code=c&bank_state=${state}`);
  });
  afterEach(() => window.history.replaceState(null, "", "/"));

  const renderPage = () =>
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Page />
      </QueryClientProvider>,
    );

  it("finishes the link, clears the code from the address bar and says which bank linked", async () => {
    invoke.mockResolvedValue({
      data: { bank_linked: "2", bank: "Revolut", currencies: "EUR,GBP" },
      error: null,
    });
    renderPage();
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Revolut: EUR, GBP"));
    expect(invoke).toHaveBeenCalledWith("complete-bank-consent", { body: { code: "c", state } });
    expect(window.location.search).toBe("");
  });

  it("reads the code from the fragment, where the bank redirect now puts it", async () => {
    window.history.replaceState(null, "", `/accounts#bank_code=f&bank_state=${state}`);
    invoke.mockResolvedValue({
      data: { bank_linked: "1", bank: "N26", currencies: "EUR" },
      error: null,
    });
    renderPage();
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(invoke).toHaveBeenCalledWith("complete-bank-consent", { body: { code: "f", state } });
    expect(window.location.hash).toBe("");
  });

  it("shows the error when the link can't be finished", async () => {
    invoke.mockResolvedValue({ data: null, error: new Error("boom") });
    renderPage();
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Couldn't connect bank", {
        description: "Couldn't link the bank, please try again",
      }),
    );
    expect(toast.success).not.toHaveBeenCalled();
  });
});
