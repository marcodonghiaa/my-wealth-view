import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AccountBadge } from "./bank-badge";

describe("AccountBadge", () => {
  it("shows a monogram tile for a known bank without loading any external logo", () => {
    const { container } = render(<AccountBadge label="Revolut EUR" />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("R")).toBeInTheDocument();
    expect(screen.getByTitle("Revolut EUR")).toBeInTheDocument();
  });

  it("uses the same tile for an unknown bank", () => {
    const { container } = render(<AccountBadge label="Acme Bank" />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("tints a known bank with its brand color", () => {
    render(<AccountBadge label="Wise USD" />);
    expect(screen.getByTitle("Wise USD").getAttribute("style")).toContain("chart-2");
  });
});
