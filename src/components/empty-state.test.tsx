import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyState } from "./empty-state";

describe("EmptyState", () => {
  it("draws an outline fox with the title", () => {
    render(<EmptyState title="No rules yet." />);
    expect(screen.getByText("No rules yet.")).toBeInTheDocument();
    const path = screen.getByTestId("empty-fox").querySelector("path");
    expect(path).toHaveAttribute("fill", "none");
    expect(path).toHaveAttribute("stroke", "currentColor");
    expect(path).toHaveAttribute("stroke-width", "2");
  });

  it("shows the hint and action only when given", () => {
    const { rerender } = render(<EmptyState title="Empty" />);
    expect(screen.queryByText("Add one")).not.toBeInTheDocument();
    rerender(<EmptyState title="Empty" hint="Try later." action={<button>Add one</button>} />);
    expect(screen.getByText("Try later.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add one" })).toBeInTheDocument();
  });
});
