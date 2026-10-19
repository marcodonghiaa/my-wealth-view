import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AccountBadge } from "./bank-badge";

describe("AccountBadge", () => {
  // protects=a known bank shows its own logo from our own files; fails_when=the logo is missing
  // or loaded from another site
  it.each([
    ["Revolut EUR", "/banks/revolut.png"],
    ["Wise USD", "/banks/wise.png"],
    ["Fineco EUR", "/banks/fineco.jpg"],
  ])("shows the logo for %s from a local file", (label, src) => {
    render(<AccountBadge label={label} />);
    const img = screen.getByRole("img", { name: label.split(" ")[0] ?? "" });
    expect(img.getAttribute("src")).toBe(src);
    expect(screen.getByTitle(label)).toBeInTheDocument();
  });

  it("matches the bank name whatever its case", () => {
    render(<AccountBadge label="revolut GBP" />);
    expect(screen.getByRole("img").getAttribute("src")).toBe("/banks/revolut.png");
  });

  it("shows a monogram tile for an unknown bank, without any image", () => {
    const { container } = render(<AccountBadge label="Acme Bank" />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("A")).toBeInTheDocument();
  });
});
