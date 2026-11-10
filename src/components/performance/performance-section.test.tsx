import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import type { Measured, MeasuredRow } from "@/lib/trades";
import { summarizeTrades } from "@/lib/trades";
import type { PerformanceRow } from "@/lib/performance";
import { PerformanceSummary, ReturnCell, ReturnText, TradesImport } from "./performance-section";

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
const ok = (gain: number, base: number): Measured => ({
  state: "ok",
  gain,
  base,
  change: gain / base,
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
  const ranked = [
    { row: row("A"), measured: ok(300, 1000) },
    { row: row("B"), measured: ok(-100, 1000) },
  ];

  it("shows total return since purchase in percent and euros, as a quiet line", () => {
    renderWith(<PerformanceSummary perf={perf([{ row: row("K"), measured: ok(200, 1000) }])} />);
    expect(screen.getByText("+20.00%")).toBeInTheDocument();
    expect(screen.getByText(/\+.*200/)).toBeInTheDocument();
    expect(screen.getByText("Total return since purchase")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Return" })).toHaveClass("text-sm");
    expect(screen.queryByText(/holdings/)).not.toBeInTheDocument();
    // The import lives under the holdings now (TradesImport), not in the hero.
    expect(screen.queryByText("Import trades from CSV")).not.toBeInTheDocument();
  });

  it("names the best and the worst holding", () => {
    renderWith(<PerformanceSummary perf={perf(ranked, { summary: summarizeTrades(ranked, 1) })} />);
    expect(screen.getByText("Best")).toBeInTheDocument();
    expect(screen.getByText("+30.00%")).toBeInTheDocument();
    expect(screen.getByText("−10.00%")).toBeInTheDocument();
  });

  it("leaves out Worst when everything is up", () => {
    const up = [
      { row: row("A"), measured: ok(300, 1000) },
      { row: row("B"), measured: ok(100, 1000) },
    ];
    renderWith(<PerformanceSummary perf={perf(up, { summary: summarizeTrades(up, 1) })} />);
    expect(screen.getByText("Best")).toBeInTheDocument();
    expect(screen.queryByText("Worst")).not.toBeInTheDocument();
  });

  it("while holdings lack trades, says how many count", () => {
    renderWith(
      <PerformanceSummary
        perf={perf([
          { row: row("A"), measured: ok(200, 1000) },
          { row: row("B"), measured: { state: "no_trades" } },
        ])}
      />,
    );
    expect(screen.getByText(/on 1 of 2 holdings/)).toBeInTheDocument();
  });

  it("asks for purchases instead of showing a number when there are none", () => {
    renderWith(
      <PerformanceSummary perf={perf([{ row: row("A"), measured: { state: "no_trades" } }])} />,
    );
    expect(screen.getByText("Add your purchases to see your return.")).toBeInTheDocument();
    expect(screen.queryByText("Total return since purchase")).not.toBeInTheDocument();
  });

  it("shows a load error and the not-yet-migrated note", () => {
    const { unmount } = renderWith(
      <PerformanceSummary perf={perf([], { error: new Error("boom") })} />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("boom");
    unmount();
    renderWith(<PerformanceSummary perf={perf([], { unavailable: true })} />);
    expect(screen.getByText(/latest update/)).toBeInTheDocument();
  });
});

describe("TradesImport", () => {
  it("is always offered once returns load, 44px tall", () => {
    // Always there: a new buy still matches your old share count, so nothing else would prompt it.
    renderWith(<TradesImport perf={perf([{ row: row("A"), measured: ok(200, 1000) }])} />);
    expect(screen.getByRole("button", { name: "Import trades from CSV" })).toHaveClass("min-h-11");
  });

  it("is left out while loading, before the migration, or on a load error", () => {
    for (const over of [{ isPending: true }, { unavailable: true }, { error: new Error("x") }]) {
      const { container, unmount } = renderWith(<TradesImport perf={perf([], over)} />);
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });
});

describe("ReturnText", () => {
  it("says the same as ReturnCell without being a button", () => {
    renderWith(
      <ReturnText perf={perf([{ row: row("K"), measured: ok(200, 1000) }])} holdingKey="K" />,
    );
    expect(screen.getByText("+20.00%")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("asks for purchases, or shows a dash with no key or while loading", () => {
    const none = perf([{ row: row("A"), measured: { state: "no_trades" } }]);
    const { unmount } = renderWith(<ReturnText perf={none} holdingKey="A" />);
    expect(screen.getByText("Add purchases")).toBeInTheDocument();
    unmount();
    const { unmount: u2 } = renderWith(<ReturnText perf={none} holdingKey={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    u2();
    renderWith(<ReturnText perf={perf([], { isPending: true })} holdingKey="A" />);
    expect(screen.getByText("…")).toBeInTheDocument();
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

  it("shows the return, as the way into its trades", () => {
    cell(ok(200, 1000));
    // 44px tall so it's easy to tap on a phone (it was 24px).
    expect(screen.getByRole("button", { name: "+20.00%" })).toHaveClass("min-h-11");
  });

  it("asks for purchases when there are none", () => {
    cell({ state: "no_trades" });
    expect(screen.getByText("Add purchases")).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it("a leftover shows a dash and asks for nothing", () => {
    cell({ state: "dust" });
    expect(screen.queryByText("Add purchases")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "—" })).toBeInTheDocument();
  });

  it("says when trades don't match, with no number", () => {
    cell({ state: "mismatch", traded: 8, held: 10 });
    expect(screen.getByText("Trades don't match")).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
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
