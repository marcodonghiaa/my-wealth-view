import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const navigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));

import { InvestingSwitch } from "./investing-switch";

describe("InvestingSwitch", () => {
  beforeEach(() => navigate.mockClear());

  it("marks the page you're on, phones only, with 44px targets", () => {
    const { container } = render(<InvestingSwitch current="/crypto" />);
    expect(screen.getByRole("radio", { name: "Crypto" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Portfolio" })).not.toBeChecked();
    expect(container.firstChild).toHaveClass("md:hidden");
    expect(screen.getByRole("radio", { name: "Portfolio" })).toHaveClass("min-h-11");
  });

  it("navigates to the other page, so Back and deep links work", async () => {
    render(<InvestingSwitch current="/portfolio" />);
    await userEvent.click(screen.getByRole("radio", { name: "Crypto" }));
    expect(navigate).toHaveBeenCalledWith({ to: "/crypto" });
  });

  it("does nothing when you tap the page you're on", async () => {
    render(<InvestingSwitch current="/portfolio" />);
    await userEvent.click(screen.getByRole("radio", { name: "Portfolio" }));
    expect(navigate).not.toHaveBeenCalled();
  });
});
