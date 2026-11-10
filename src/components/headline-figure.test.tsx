import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { HeadlineFigure } from "./headline-figure";

const css = readFileSync(path.resolve(__dirname, "../styles.css"), "utf8");

describe("figure-display (HeadlineFigure)", () => {
  // Regression: a total of about €10 billion ran past a 375px screen and made the
  // page scroll sideways. jsdom has no layout, so check the rule that fixes it.
  it("lets a very long amount wrap instead of widening the page", () => {
    const rule = css.match(/@utility figure-display\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toMatch(/overflow-wrap:\s*anywhere/);
    expect(rule).toMatch(/font-weight:\s*400/);
  });

  it("keeps cents and symbol at full size: cents at 55%, symbol muted", () => {
    const { container } = render(<HeadlineFigure value={1234.5} currency="EUR" />);
    const figure = container.querySelector(".figure-display")!;
    expect(figure).toHaveTextContent("€1,234.50");
    const cents = [...figure.querySelectorAll(".opacity-55")];
    expect(cents.map((c) => c.textContent).join("")).toBe(".50");
    expect(cents[0]!.className).not.toMatch(/text-\[0\.5em\]/);
    expect(screen.getByText("€").className).toContain("text-muted-foreground");
  });

  it("keeps the symbol muted when the locale writes it after the cents", () => {
    Object.defineProperty(navigator, "language", { value: "de-DE", configurable: true });
    const { container } = render(<HeadlineFigure value={1234.5} currency="EUR" />);
    Object.defineProperty(navigator, "language", { value: "en-GB", configurable: true });
    const figure = container.querySelector(".figure-display")!;
    expect(figure.textContent).toBe("1.234,50\u00a0€");
    const cents = [...figure.querySelectorAll(".opacity-55")].map((c) => c.textContent).join("");
    expect(cents).toBe(",50");
    expect(screen.getByText("€").className).toContain("text-muted-foreground");
  });

  it("has no delta line unless asked", () => {
    render(<HeadlineFigure value={10} currency="EUR" />);
    expect(screen.queryByText("Month")).not.toBeInTheDocument();
  });

  it("colours the delta by sign and sets the label muted", () => {
    const { rerender } = render(
      <HeadlineFigure
        value={10}
        currency="EUR"
        delta={{ value: 12.5, percent: 0.012, label: "Month" }}
      />,
    );
    const gain = screen.getByText(/\+€12\.50 \(\+1\.2%\)/);
    expect(gain.className).toContain("font-figure");
    expect(gain.className).toContain("text-positive");
    expect(screen.getByText("Month").className).toContain("text-muted-foreground");

    rerender(<HeadlineFigure value={10} currency="EUR" delta={{ value: -3, label: "YTD" }} />);
    expect(screen.getByText("−€3.00").className).toContain("text-negative");

    rerender(<HeadlineFigure value={10} currency="EUR" delta={{ value: 0, label: "Today" }} />);
    expect(screen.getByText("€0.00").className).toContain("text-foreground");
  });
});
