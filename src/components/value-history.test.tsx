import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RangeChange } from "./value-history";
import type { ValueHistory } from "@/lib/use-value-history";

type Point = NonNullable<ValueHistory["first"]>;
const day = (snapshot_date: string) => ({ snapshot_date }) as Point;

describe("RangeChange", () => {
  it("names the selected range, as on Net Worth", () => {
    render(<RangeChange delta={200} change={0.2} first={day("2025-12-31")} range="YTD" />);
    expect(screen.getByText(/\+€200\.00 \(\+20\.00%\)/)).toHaveClass("text-positive");
    expect(screen.getByText("Year to date")).toBeInTheDocument();
  });

  it("while scrubbing, names the days it spans", () => {
    render(
      <RangeChange
        delta={-50}
        change={-0.05}
        first={day("2026-10-10")}
        scrubbed={day("2026-11-01")}
        range="1M"
      />,
    );
    expect(screen.getByText(/−€50\.00 \(−5\.00%\)/)).toBeInTheDocument();
    expect(screen.getByText(/10 Oct 2026 – 1 Nov 2026/)).toBeInTheDocument();
    expect(screen.queryByText("Past month")).not.toBeInTheDocument();
  });

  it("says nothing without a start to compare with", () => {
    const { container } = render(
      <RangeChange delta={null} change={null} first={undefined} range="ALL" />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
