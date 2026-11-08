import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NavBadge } from "./nav-badge";

describe("NavBadge", () => {
  it("shows the count", () => {
    render(<NavBadge count={3} />);
    expect(screen.getByLabelText("3 to review")).toHaveTextContent("3");
  });
  it("is hidden at 0 and when undefined", () => {
    const { container, rerender } = render(<NavBadge count={0} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<NavBadge count={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});
