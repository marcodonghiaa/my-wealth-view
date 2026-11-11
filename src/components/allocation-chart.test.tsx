import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// jsdom has no ResizeObserver; the donut itself is not under test.
vi.mock("recharts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("recharts")>()),
  ResponsiveContainer: () => null,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

import { AllocationChart } from "./allocation-chart";

const live = (liabilities_eur?: number) => ({
  snapshot_date: "2026-10-19",
  total_eur: 1000 - (liabilities_eur ?? 0),
  bank_total_eur: 400,
  portfolio_total_eur: 600,
  crypto_total_eur: 0,
  ...(liabilities_eur === undefined ? {} : { liabilities_eur }),
});

describe("AllocationChart", () => {
  // protects=Net Worth and Portfolio name ETFs the same way; fails_when=ETFs show as plain "Stocks"
  it("labels non-bond holdings as stocks and ETFs", () => {
    render(<AllocationChart history={[]} snapshots={[live()]} />);
    expect(screen.getByText("Stocks & ETFs")).toBeInTheDocument();
    expect(screen.queryByText("Stocks")).toBeNull();
  });

  // protects=the breakdown adds up to net worth; fails_when=debts are left out of it
  it("lists debts as a negative line after the assets", () => {
    render(<AllocationChart history={[]} snapshots={[live(300)]} />);
    expect(screen.getByText("Debts")).toBeInTheDocument();
    expect(screen.getByText("-€300.00")).toBeInTheDocument();
    // Shares stay of what you hold.
    expect(screen.getByText("40.0%")).toBeInTheDocument();
  });

  it("has no debts line without debts", () => {
    render(<AllocationChart history={[]} snapshots={[live()]} />);
    expect(screen.queryByText("Debts")).not.toBeInTheDocument();
  });

  // protects=each breakdown row leads to the page behind its number; fails_when=rows go nowhere
  it("links each class to its page and debts to accounts", () => {
    render(<AllocationChart history={[]} snapshots={[{ ...live(300), crypto_total_eur: 50 }]} />);
    const href = (name: RegExp) => screen.getByRole("link", { name }).getAttribute("href");
    expect(href(/^Stocks & ETFs/)).toBe("/portfolio");
    expect(href(/^Crypto/)).toBe("/crypto");
    expect(href(/^Cash/)).toBe("/accounts");
    expect(href(/^Debts/)).toBe("/accounts");
  });

  it("leaves the unallocated row unlinked", () => {
    render(
      <AllocationChart
        history={[
          {
            snapshot_date: "2025-01-31",
            stocks_eur: 0,
            bonds_eur: 0,
            crypto_eur: 0,
            cash_eur: 0,
            other_eur: 100,
            liabilities_eur: 0,
            total_eur: 100,
          },
        ]}
        snapshots={[]}
      />,
    );
    expect(screen.getByText("Unallocated")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
