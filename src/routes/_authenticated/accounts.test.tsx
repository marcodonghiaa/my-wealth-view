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
  afterEach(() => vi.restoreAllMocks());

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
