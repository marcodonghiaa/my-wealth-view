import { describe, expect, it } from "vitest";
import { suggestCategory } from "./suggest-category";

describe("suggestCategory", () => {
  // protects=imported spend lands in the categories the app shows; fails_when=a known name or
  // keyword maps elsewhere; no_claim=every merchant name (unknown ones fall to Others)
  it("keeps a name that already is an app category, ignoring case", () => {
    expect(suggestCategory("dine out")).toBe("Dine Out");
    expect(suggestCategory("  GROCERIES ")).toBe("Groceries");
  });

  it.each([
    ["Supermercato", "Groceries"],
    ["Restaurants", "Dine Out"],
    ["Ristorante", "Dine Out"],
    ["Rent", "Housing"],
    ["Affitto", "Housing"],
    ["Uber / taxi", "Transports"],
    ["Netflix subscription", "Entertainment"],
    ["Farmacia", "Health"],
    ["Travel", "Experiences"],
    ["Taxes", "Taxes"],
    ["Tasse", "Taxes"],
    ["F24 p.iva", "Taxes"],
    ["Agenzia delle Entrate", "Taxes"],
    ["Imposta sostitutiva", "Taxes"],
    ["Income tax", "Taxes"],
  ])("maps %j to %s", (raw, expected) => {
    expect(suggestCategory(raw)).toBe(expected);
  });

  // protects=taxi rides stay transport; fails_when=the tax keyword matches inside "taxi"
  it("does not read a taxi as a tax", () => {
    expect(suggestCategory("Taxi to airport")).toBe("Transports");
  });

  it("falls back to Others for unknown or empty names", () => {
    expect(suggestCategory("zzz")).toBe("Others");
    expect(suggestCategory("")).toBe("Others");
  });
});
