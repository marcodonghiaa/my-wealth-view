import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import type { Measured, MeasuredRow } from "@/lib/trades";
import { summarizeTrades } from "@/lib/trades";
import type { PerformanceRow } from "@/lib/performance";
import { PerformanceSummary, ReturnCell } from "./performance-section";

const row = (key: string): PerformanceRow => ({
  kind: "stock",
  key,
  name: key,
  quantity: 10,
  start_date: "2026-09-30",
  start_price_eur: 100,
  end_date: "2026-10-30",
  end_price_eur: 120,
  status: "ok",
});
const ok = (gain: number, base: number, since: string | null = null): Measured => ({
  state: "ok",
  gain,
  base,
  change: gain / base,
  since,
});

const trade = {
  id: "1",
  kind: "stock",
  key: "K",
  side: "buy",
  trade_date: "2026-01-01",
  shares: 10,
  price_eur: 90,
  fee_eur: 0,
};

const perf = (rows: Array<MeasuredRow>, over: Record<string, unknown> = {}) =>
  ({
    kind: "stock",
    summary: summarizeTrades(rows),
    measuredByKey: new Map(rows.map((r) => [r.row.key, r.measured])),
    tradesByKey: new Map(
      rows.filter((r) => r.measured.state !== "no_trades").map((r) => [r.row.key, [trade]]),
    ),
    isPending: false,
    unavailable: false,
    error: null,
    ...over,
  }) as unknown as Parameters<typeof PerformanceSummary>[0]["perf"];

const renderWith = (ui: ReactElement) =>
  render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

describe("PerformanceSummary", () => {
  it("shows the return, the gain in euros and the range", () => {
    renderWith(
      <PerformanceSummary perf={perf([{ row: row("K"), measured: ok(200, 1000) }])} range="1M" />,
    );
    expect(screen.getByText("+20.00%")).toBeInTheDocument();
    expect(screen.getByText(/\+.*200/)).toBeInTheDocument();
    expect(screen.getByText(/Return · Past month/)).toBeInTheDocument();
  });

  it("says how many holdings the number covers", () => {
    renderWith(
      <PerformanceSummary
        perf={perf([
          { row: row("A"), measured: ok(200, 1000) },
          { row: row("B"), measured: { state: "no_trades" } },
        ])}
        range="1M"
      />,
    );
    expect(screen.getByText(/On 1 of 2 holdings\./)).toBeInTheDocument();
  });

  it("asks for purchases instead of showing a number when there are none", () => {
    renderWith(
      <PerformanceSummary
        perf={perf([{ row: row("A"), measured: { state: "no_trades" } }])}
        range="1M"
      />,
    );
    expect(screen.getByText("Add your purchases to see your return.")).toBeInTheDocument();
    expect(screen.queryByText(/Return ·/)).not.toBeInTheDocument();
  });

  it("offers CSV import", () => {
    renderWith(<PerformanceSummary perf={perf([])} range="1M" />);
    expect(screen.getByText("Import trades from CSV")).toBeInTheDocument();
  });

  it("shows a load error, a skeleton, and the not-yet-migrated note", () => {
    const { unmount } = renderWith(
      <PerformanceSummary perf={perf([], { error: new Error("boom") })} range="1M" />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("boom");
    unmount();
    renderWith(<PerformanceSummary perf={perf([], { unavailable: true })} range="1M" />);
    expect(screen.getByText(/latest update/)).toBeInTheDocument();
  });
});

describe("ReturnCell", () => {
  const cell = (measured: Measured, over: Record<string, unknown> = {}) =>
    renderWith(
      <ReturnCell
        perf={perf([{ row: row("K"), measured }], over)}
        holdingKey="K"
        name="Holding"
        quantity={10}
      />,
    );

  it("shows the return and the gain", () => {
    cell(ok(200, 1000));
    expect(screen.getByText("+20.00%")).toBeInTheDocument();
    expect(screen.getByText("Trades")).toBeInTheDocument();
  });

  it("asks for purchases when there are none", () => {
    cell({ state: "no_trades" });
    expect(screen.getByText("Add purchases")).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it("says when trades don't match, with no number", () => {
    cell({ state: "mismatch", traded: 8, held: 10 });
    expect(screen.getByText("Trades don't match")).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it("shows since when measured from the first price", () => {
    cell(ok(200, 1000, "2025-11-01"));
    expect(screen.getByText(/since/)).toBeInTheDocument();
  });

  it("doesn't ask for purchases you may already have when loading them failed", () => {
    cell({ state: "no_trades" }, { error: new Error("boom") });
    expect(screen.queryByText("Add purchases")).not.toBeInTheDocument();
  });

  it("doesn't claim anything while loading", () => {
    cell({ state: "no_trades" }, { isPending: true });
    expect(screen.queryByText("Add purchases")).not.toBeInTheDocument();
    expect(screen.getByText("…")).toBeInTheDocument();
  });
});
