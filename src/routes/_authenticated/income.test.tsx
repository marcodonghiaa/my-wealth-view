import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const flow = vi.hoisted(() => ({
  current: { income_eur: 2450, expenses_eur: 1382.34 } as Record<string, number> | null,
}));
const today = new Date();
const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;

const from: string[] = [];
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "order", "eq", "lt", "in"]) q[m] = () => q;
      q["gte"] = (_col: string, v: unknown) => (from.push(String(v)), q);
      q["maybeSingle"] = () => Promise.resolve({ data: flow.current, error: null });
      q["then"] = (resolve: (v: unknown) => void) =>
        resolve({
          data:
            table === "v_transactions_eur"
              ? [
                  {
                    entry_reference: "e1",
                    account_uid: "a1",
                    booking_date: day,
                    category: "Income",
                    creditor_name: "Income",
                    currency: "EUR",
                    amount: 2000,
                    signed_amount_eur: 2000,
                  },
                  {
                    entry_reference: "e2",
                    account_uid: "a1",
                    booking_date: day,
                    category: "Salary",
                    creditor_name: "ACME Ltd",
                    currency: "EUR",
                    amount: 450,
                    signed_amount_eur: 450,
                  },
                ]
              : [],
          error: null,
        });
      return q;
    },
  },
}));

import { Route } from "./income";

const Page = Route.options.component as () => React.JSX.Element;
let search: { month?: string } = {};
vi.spyOn(Route, "useSearch").mockImplementation((() => search) as never);
const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Page />
    </QueryClientProvider>,
  );

// protects=Income opens like Spending (month, Received, figure) and says what is left (#11);
// fails_when=the net line goes missing, or reads +€0.00 for a month with nothing recorded
describe("Income header", () => {
  it("shows Received and the net after spending", async () => {
    flow.current = { income_eur: 2450, expenses_eur: 1382.34 };
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Income" })).toHaveClass("sr-only");
    expect(screen.getByText("Received")).toBeTruthy();
    expect((await screen.findByText(/Net after spending/)).textContent).toContain("+€1,067.66");
  });

  it("leaves the net line out for a month with no income or spending row", async () => {
    flow.current = null;
    renderPage();
    await screen.findByText("ACME Ltd");
    expect(screen.queryByText(/Net after spending/)).toBeNull();
  });
});

// protects=no "Income · Income" rows; fails_when=a chip that adds information is hidden too
describe("Income rows", () => {
  it("hides the category chip only when it repeats the row name", async () => {
    renderPage();
    await screen.findByText("ACME Ltd");
    // The row named "Income" keeps its title but loses the matching chip.
    expect(screen.getAllByText("Income", { ignore: "h1" })).toHaveLength(1);
    expect(screen.getByText("Salary")).toBeTruthy();
  });
});

// Polish 5 #1: Cash flow's Income row opens this page on its month (?month=YYYY-MM).
describe("Income month from the link", () => {
  it("opens on the month in the link", async () => {
    search = { month: "2026-08" };
    from.length = 0;
    renderPage();
    await waitFor(() => expect(from).toContain("2026-08-01"));
    expect(from.every((d) => d.startsWith("2026-08") || d.startsWith("2026-07"))).toBe(true);
    search = {};
  });
});
