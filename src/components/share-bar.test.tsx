import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ShareBar, rankShares } from "./share-bar";

describe("rankShares", () => {
  it("orders largest first and tones by rank, darkest first", () => {
    const ranked = rankShares([
      { label: "Small", value: 1 },
      { label: "Big", value: 10 },
    ]);
    expect(ranked.map((s) => s.label)).toEqual(["Big", "Small"]);
    expect(ranked[0]!.tone).toBe("var(--color-chart-1)");
    expect(ranked[1]!.tone).toBe("var(--color-chart-2)");
  });
});

describe("ShareBar", () => {
  it("renders nothing when there is no total", () => {
    const { container } = render(<ShareBar title="Mix" shares={[{ label: "A", value: 0 }]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows code, label and share in the legend, with a text alternative", () => {
    render(
      <ShareBar
        title="Mix"
        shares={[
          { label: "Cash", value: 25, code: "CA" },
          { label: "Stocks", value: 75, code: "ST" },
        ]}
      />,
    );
    expect(screen.getByRole("img", { name: "Mix: Stocks 75%, Cash 25%." })).toBeInTheDocument();
    expect(screen.getByText("ST ·")).toBeInTheDocument();
    expect(screen.getByText("75.0%")).toBeInTheDocument();
  });
});
