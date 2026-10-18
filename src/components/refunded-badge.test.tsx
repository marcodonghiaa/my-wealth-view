import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RefundedBadge } from "./refunded-badge";

describe("RefundedBadge", () => {
  it("renders a Refunded badge when the flow type is refunded", () => {
    render(<RefundedBadge flowType="refunded" />);
    expect(screen.getByText("Refunded")).toBeInTheDocument();
  });

  it("renders nothing for any other flow type", () => {
    const { container } = render(<RefundedBadge flowType="spend" />);
    expect(container).toBeEmptyDOMElement();
  });
});
