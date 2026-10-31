import { cleanup, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { summarize } from "@/lib/performance";
import type { PerformanceRow } from "@/lib/performance";
import { PerformanceSummary, ReturnCell } from "./performance-section";

const row = (over: Partial<PerformanceRow> = {}): PerformanceRow => ({
  kind: "stock",
  key: "K",
  name: "Holding",
  quantity: 10,
  start_date: "2026-09-30",
  start_price_eur: 100,
  end_date: "2026-10-30",
  end_price_eur: 120,
  status: "ok",
  ...over,
});

const perf = (rows: Array<PerformanceRow>, over: Record<string, unknown> = {}) =>
  ({
    rows,
    rowsByKey: new Map(),
    summary: summarize(rows),
    isPending: false,
    unavailable: false,
    error: null,
    ...over,
  }) as unknown as Parameters<typeof PerformanceSummary>[0]["perf"];

const NOTE = "Prices only, in EUR.";

describe("PerformanceSummary", () => {
  it("shows the return, the range and the note", () => {
    render(<PerformanceSummary perf={perf([row()])} range="1M" note={NOTE} />);
    expect(screen.getByText("+20.00%")).toBeInTheDocument();
    expect(screen.getByText(/Return · Past month/)).toBeInTheDocument();
    expect(screen.getByText(/Prices only, in EUR\./)).toBeInTheDocument();
  });

  it("says since <date> when every holding is younger than the range", () => {
    const young = [row({ status: "since", start_date: "2026-10-28" })];
    render(<PerformanceSummary perf={perf(young)} range="3M" note={NOTE} />);
    expect(screen.getByText(/Return · since 28 Oct 2026/)).toBeInTheDocument();
  });

  it("counts holdings measured from their first price and holdings left out", () => {
    const rows = [
      row({ key: "A" }),
      row({ key: "B", status: "since", start_date: "2026-10-20" }),
      row({ key: "C", status: "stale" }),
    ];
    render(<PerformanceSummary perf={perf(rows)} range="1M" note={NOTE} />);
    expect(screen.getByText(/1 holding measured from the first price we have/)).toBeInTheDocument();
    expect(
      screen.getByText(/1 holding without a price for this range left out/),
    ).toBeInTheDocument();
  });

  it("shows a dash, not NaN, with nothing to measure", () => {
    render(<PerformanceSummary perf={perf([])} range="1M" note={NOTE} />);
    expect(screen.queryByText(/NaN/)).toBeNull();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("lists best and worst when there are at least two holdings", () => {
    const rows = [
      row({ key: "A", name: "Up" }),
      row({ key: "B", name: "Down", end_price_eur: 80 }),
    ];
    render(<PerformanceSummary perf={perf(rows)} range="1M" note={NOTE} />);
    expect(screen.getByText("Best")).toBeInTheDocument();
    expect(screen.getByText("Up")).toBeInTheDocument();
    expect(screen.getByText("Down")).toBeInTheDocument();
    expect(screen.getByText("−20.00%")).toBeInTheDocument();
  });

  it("loading: a skeleton, no figure", () => {
    const { container } = render(
      <PerformanceSummary perf={perf([], { isPending: true })} range="1M" note={NOTE} />,
    );
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
    expect(screen.queryByText(/Return/)).toBeNull();
  });

  it("error: an alert with the message", () => {
    render(
      <PerformanceSummary perf={perf([], { error: new Error("boom") })} range="1M" note={NOTE} />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load returns: boom");
  });

  it("database without the function: a quiet note, not an error", () => {
    render(<PerformanceSummary perf={perf([], { unavailable: true })} range="1M" note={NOTE} />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText(/latest update/)).toBeInTheDocument();
  });
});

describe("ReturnCell", () => {
  it("shows the return, with since <date> for a young holding", () => {
    render(<ReturnCell row={row({ status: "since", start_date: "2026-10-28" })} />);
    expect(screen.getByText("+20.00%")).toBeInTheDocument();
    expect(screen.getByText("since 28 Oct 2026")).toBeInTheDocument();
  });

  it("a dash with the reason for a holding with no number", () => {
    render(<ReturnCell row={row({ status: "stale" })} />);
    expect(screen.getByTitle("No price for this range")).toHaveTextContent("—");
  });

  it("a dash when the holding is not in the result at all", () => {
    render(<ReturnCell row={undefined} pending />);
    expect(screen.queryByTitle("No price for this range")).not.toBeInTheDocument();
    cleanup();
    render(<ReturnCell row={undefined} />);
    expect(screen.getByTitle("No price for this range")).toBeInTheDocument();
  });
});
