import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NavBadge } from "./nav-badge";

describe("NavBadge", () => {
  it("shows the count", () => {
    render(<NavBadge count={3} />);
    const badge = screen.getByText("to review").parentElement!;
    expect(badge).toHaveTextContent("3 to review");
  });
  it("renders as mono Ember text, not a filled pill", () => {
    render(<NavBadge count={3} />);
    const badge = screen.getByText("to review").parentElement!;
    expect(badge).toHaveClass("ml-auto", "font-figure", "text-ember");
    expect(badge.className).not.toMatch(/rounded-full|bg-/);
  });
  it("is hidden at 0 and when undefined", () => {
    const { container, rerender } = render(<NavBadge count={0} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<NavBadge count={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});
