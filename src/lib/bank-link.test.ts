import { describe, it, expect } from "vitest";
import {
  COUNTRIES,
  countriesFor,
  defaultCountry,
  linkErrorMessage,
  linkedMessage,
  pendingLink,
  renewTarget,
} from "./bank-link";

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
    expect(renewTarget("Revolut", [row("Revolut EUR", "Revolut", "US")])).toBeNull();
  });

  it("prefills a Lithuanian bank (Revolut)", () => {
    expect(renewTarget("Revolut", [row("Revolut EUR", "Revolut", "LT")])).toEqual({
      bankName: "Revolut",
      country: "LT",
    });
  });

  it("returns null when no row matches the bank", () => {
    expect(renewTarget("Wise", [row("Revolut EUR", "Revolut", "IE")])).toBeNull();
  });

  // protects=every country Enable Banking covers can be picked (the landing promises 31);
  // fails_when=a country such as Lithuania (Revolut's bank) is missing from the form
  it("lists the 31 EEA and UK countries, Lithuania included", () => {
    expect(COUNTRIES).toHaveLength(31);
    expect(new Set(COUNTRIES.map((c) => c.code)).size).toBe(31);
    expect(COUNTRIES.map((c) => c.code)).toEqual(
      expect.arrayContaining(["LT", "PL", "SE", "IT", "GB"]),
    );
  });

  // protects=country names follow the UI language, in that language's alphabetical order, so the
  // Italian UI needs no translated list; fails_when=names stay English or keep the English order
  it("names and sorts the countries in the given language", () => {
    const it = countriesFor("it");
    expect(it.find((c) => c.code === "DE")?.name).toBe("Germania");
    const names = it.map((c) => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "it")));
    expect(COUNTRIES.find((c) => c.code === "GB")?.name).toBe("United Kingdom");
  });
});

// Regression: ?bank_link_error was shown word for word, so a crafted link could put any text
// (a fake support number) in the app's own error toast.
describe("linkErrorMessage", () => {
  it("shows the callback's own messages", () => {
    const p = new URLSearchParams({ bank_link_error: "The bank did not approve the connection" });
    expect(linkErrorMessage(p)).toBe("The bank did not approve the connection");
  });

  it("replaces any other text with a fixed message", () => {
    const p = new URLSearchParams({ bank_link_error: "Call +39 000 000 to verify your account" });
    expect(linkErrorMessage(p)).toBe("Couldn't link the bank, please try again");
  });

  it("is null without an error", () => {
    expect(linkErrorMessage(new URLSearchParams())).toBeNull();
  });
});

describe("pendingLink", () => {
  it("reads the code and state the bank's redirect forwards", () => {
    expect(pendingLink(new URLSearchParams("bank_code=c1&bank_state=s1"))).toEqual({
      code: "c1",
      state: "s1",
    });
  });
  it("is null unless both are there", () => {
    expect(pendingLink(new URLSearchParams("bank_code=c1"))).toBeNull();
    expect(pendingLink(new URLSearchParams("bank_state=s1"))).toBeNull();
    expect(pendingLink(new URLSearchParams("bank_linked=2"))).toBeNull();
  });
});

describe("linkErrorMessage for complete-bank-consent replies", () => {
  it("shows the not-signed-in reason", () => {
    expect(linkErrorMessage(new URLSearchParams({ bank_link_error: "Not signed in" }))).toBe(
      "Not signed in",
    );
  });
});

describe("defaultCountry", () => {
  it("takes the region of the first browser language in the list", () => {
    expect(defaultCountry(["en", "de-AT", "fr-FR"])).toBe("AT");
  });

  it("infers the country of a bare language", () => {
    expect(defaultCountry(["it"])).toBe("IT");
    expect(defaultCountry(["sv"])).toBe("SE");
  });

  // protects=no country is pre-picked for the user by accident; fails_when=en-US or ja browsers
  // start on whichever country sorts first (Austria) (polish 4, P2-3)
  it("picks no country when no listed region is found", () => {
    expect(defaultCountry(["en-US", "ja", "not a tag!"])).toBe("");
    expect(defaultCountry([])).toBe("");
  });
});
