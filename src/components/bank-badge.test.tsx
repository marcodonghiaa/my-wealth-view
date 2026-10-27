import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AccountBadge, bankOf } from "./bank-badge";

describe("AccountBadge", () => {
  // protects=a known bank shows its own logo from our own files; fails_when=the logo is missing
  // or loaded from another site
  it.each([
    ["Revolut EUR", "/banks/revolut.png"],
    ["Wise USD", "/banks/wise.png"],
    ["Fineco EUR", "/banks/fineco.jpg"],
    ["Splitwise", "/banks/splitwise.png"],
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

  it("names a bank given by name, keeping the holder label as the tooltip", () => {
    render(<AccountBadge label="Marco D'Onghia" bank="Revolut" />);
    expect(screen.getByRole("img", { name: "Revolut" }).getAttribute("src")).toBe(
      "/banks/revolut.png",
    );
    expect(screen.getByTitle("Marco D'Onghia")).toBeInTheDocument();
  });

  // protects=a bank we have no local file for shows the logo Enable Banking gave us
  it("shows the remote logo for a bank not known locally", () => {
    render(
      <AccountBadge label="Marco D'Onghia" bank="Intesa" logo="https://cdn.example/intesa.png" />,
    );
    expect(screen.getByRole("img", { name: "Intesa" }).getAttribute("src")).toBe(
      "https://cdn.example/intesa.png",
    );
  });

  it("prefers the local logo over the remote one for a known bank", () => {
    render(<AccountBadge label="x" bank="Fineco" logo="https://cdn.example/fineco.png" />);
    expect(screen.getByRole("img").getAttribute("src")).toBe("/banks/fineco.jpg");
  });

  it("ignores a logo that is not an https URL", () => {
    const { container } = render(
      <AccountBadge label="x" bank="Intesa" logo="javascript:alert(1)" />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("I")).toBeInTheDocument();
  });
});

describe("bankOf", () => {
  it("prefers the stored bank name over the holder label", () => {
    expect(bankOf({ bank_name: "Revolut", label: "Marco D'Onghia" })).toBe("Revolut");
  });

  it("falls back to the label when the bank name is missing (rows from before the column)", () => {
    expect(bankOf({ bank_name: null, label: "Revolut EUR" })).toBe("Revolut");
    expect(bankOf({ label: "Fineco" })).toBe("Fineco");
    expect(bankOf({ label: null })).toBe("Bank account");
  });
});
