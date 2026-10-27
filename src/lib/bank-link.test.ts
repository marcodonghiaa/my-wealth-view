import { describe, it, expect } from "vitest";
import { COUNTRIES, linkedMessage, renewTarget } from "./bank-link";

describe("linkedMessage", () => {
  it("names the bank and the currencies found", () => {
    const p = new URLSearchParams("bank_linked=3&bank=Revolut&currencies=EUR,GBP,USD");
    expect(linkedMessage(p)).toBe("Revolut: EUR, GBP, USD");
  });

  it("falls back to the count when an old callback sends only bank_linked", () => {
    expect(linkedMessage(new URLSearchParams("bank_linked=3"))).toBe("3 accounts connected");
    expect(linkedMessage(new URLSearchParams("bank_linked=1"))).toBe("1 account connected");
  });

  it("falls back to the count when currencies is empty", () => {
    expect(linkedMessage(new URLSearchParams("bank_linked=0&bank=Wise&currencies="))).toBe(
      "0 accounts connected",
    );
  });

  it("returns null without bank_linked", () => {
    expect(linkedMessage(new URLSearchParams(""))).toBeNull();
    expect(linkedMessage(new URLSearchParams("bank_link_error=x"))).toBeNull();
  });

  it("keeps a bank name with spaces and accents through the URL", () => {
    const sent = new URLSearchParams({
      bank_linked: "2",
      bank: "Crédit Agricole",
      currencies: "EUR",
    }).toString();
    expect(linkedMessage(new URLSearchParams(sent))).toBe("Crédit Agricole: EUR");
  });
});

describe("renewTarget", () => {
  const row = (label: string, bank_name: string | null, bank_country: string | null) => ({
    label,
    bank_name,
    bank_country,
  });

  it("uses the first row of the bank that has both name and country", () => {
    const accounts = [
      row("Fineco EUR", null, null),
      row("Revolut EUR", "Revolut", null),
      row("Revolut GBP", "Revolut", "IE"),
      row("Revolut USD", "Revolut", "GB"),
    ];
    expect(renewTarget("Revolut", accounts)).toEqual({ bankName: "Revolut", country: "IE" });
  });

  it("returns null for a label-only bank", () => {
    expect(renewTarget("Fineco", [row("Fineco EUR", null, null)])).toBeNull();
  });

  it("returns null when the stored country is not in the form's list", () => {
    expect(renewTarget("Revolut", [row("Revolut EUR", "Revolut", "LT")])).toBeNull();
  });

  it("returns null when no row matches the bank", () => {
    expect(renewTarget("Wise", [row("Revolut EUR", "Revolut", "IE")])).toBeNull();
  });

  it("lists the 10 form countries", () => {
    expect(COUNTRIES.map((c) => c.code)).toEqual([
      "IT",
      "DE",
      "FR",
      "ES",
      "GB",
      "NL",
      "BE",
      "AT",
      "PT",
      "IE",
    ]);
  });
});
