import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// jsdom has no ResizeObserver; the donut itself is not under test.
vi.mock("recharts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("recharts")>()),
  ResponsiveContainer: () => null,
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
});
