import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RangeChangeLine } from "./value-history";
import type { ValueHistory } from "@/lib/use-value-history";

const history = (range: string) =>
  ({ delta: 50, change: 0.01, scrubbed: null, first: null, range }) as unknown as ValueHistory;

describe("RangeChangeLine", () => {
  it("labels the 1D chip's value change as the past week, the window it is computed over", () => {
    render(<RangeChangeLine history={history("1D")} />);
    expect(screen.getByText(/Value change · Past week/)).toBeInTheDocument();
  });

  it("uses the range label for other ranges and flags purchases", () => {
    render(<RangeChangeLine history={history("1M")} />);
    expect(
      screen.getByText(/Value change · Past month \(includes purchases\)/),
    ).toBeInTheDocument();
  });
});
