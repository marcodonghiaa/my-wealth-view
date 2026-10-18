import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const calls: Array<[string, unknown]> = [];
const LIDL = {
  entry_reference: "r1",
  booking_date: "2026-10-03",
  creditor_name: "Lidl",
  personal_signed_amount_eur: -12.5,
};
let rows: Array<typeof LIDL> = [LIDL];
const SHARE = { id: "s1", booking_date: "2026-10-05", description: "Dinner", amount_eur: 7.5 };
let shares: Array<typeof SHARE> = [];
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const q = {
        select: () => q,
        gte: () => q,
        lt: () => q,
        lte: () => q,
        eq: (col: string, val: unknown) => (calls.push([col, val]), q),
        is: (col: string, val: unknown) => (calls.push([col, val]), q),
        lt2: () => q,
        order: () => q,
        then: (resolve: (v: unknown) => void) =>
          resolve({ data: table === "v_splitwise_eur" ? shares : rows, error: null }),
      };
      return q;
    },
  },
}));

import { CategoryRow } from "./category-row";

const renderRow = (category: string) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ul>
        <CategoryRow category={category} total={43.92} month={new Date(2026, 9, 1)} />
      </ul>
    </QueryClientProvider>,
  );

describe("CategoryRow", () => {
  it("lists the category's transactions only after it is expanded", async () => {
    renderRow("Groceries");
    expect(screen.queryByText("Lidl")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Groceries/ }));
    expect(await screen.findByText("Lidl")).toBeInTheDocument();
    expect(screen.getByText("€12.50")).toBeInTheDocument();
    expect(calls).toContainEqual(["category", "Groceries"]);
  });

  it("queries null category for Uncategorized", async () => {
    calls.length = 0;
    renderRow("Uncategorized");
    await userEvent.click(screen.getByRole("button", { name: /Uncategorized/ }));
    await screen.findByText("Lidl");
    expect(calls).toContainEqual(["category", null]);
  });

  it("explains an empty list as an imported monthly total", async () => {
    rows = [];
    renderRow("Groceries");
    await userEvent.click(screen.getByRole("button", { name: /Groceries/ }));
    expect(await screen.findByText(/total was imported/)).toBeInTheDocument();
    rows = [LIDL];
  });

  // protects=the list adds up to the category total; fails_when=Splitwise shares are in the
  // total but missing from the list, or the list is not newest first
  it("lists Splitwise shares with the bank transactions, newest first", async () => {
    shares = [SHARE];
    renderRow("Groceries");
    await userEvent.click(screen.getByRole("button", { name: /Groceries/ }));
    const dinner = await screen.findByText("Splitwise: Dinner");
    const lidl = screen.getByText("Lidl");
    expect(screen.getByText("€7.50")).toBeInTheDocument();
    expect(dinner.compareDocumentPosition(lidl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    shares = [];
  });

  it("does not call a month empty when only shares exist", async () => {
    rows = [];
    shares = [SHARE];
    renderRow("Groceries");
    await userEvent.click(screen.getByRole("button", { name: /Groceries/ }));
    expect(await screen.findByText("Splitwise: Dinner")).toBeInTheDocument();
    expect(screen.queryByText(/total was imported/)).toBeNull();
    rows = [LIDL];
    shares = [];
  });
});
