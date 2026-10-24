import { describe, expect, it } from "vitest";
import { consentAlerts } from "./consent-expiry";

const TODAY = new Date("2026-10-23T09:00:00");
const acc = (label: string, consent_valid_until: string | null) => ({ label, consent_valid_until });

describe("consentAlerts", () => {
  it("lists a bank whose consent ends within 14 days, with the days left", () => {
    expect(consentAlerts([acc("Revolut EUR", "2026-10-28T00:00:00Z")], TODAY)).toEqual([
      { bank: "Revolut", daysLeft: 5 },
    ]);
  });

  it("ignores consents further out, and accounts with no consent date", () => {
    expect(
      consentAlerts([acc("Revolut EUR", "2027-01-01T00:00:00Z"), acc("Cash", null)], TODAY),
    ).toEqual([]);
  });

  it("reports an expired consent with zero or negative days", () => {
    expect(consentAlerts([acc("Fineco", "2026-10-20T00:00:00Z")], TODAY)).toEqual([
      { bank: "Fineco", daysLeft: -3 },
    ]);
  });

  it("shows one alert per bank, using its soonest expiry, soonest bank first", () => {
    const alerts = consentAlerts(
      [
        acc("Revolut EUR", "2026-11-01T00:00:00Z"),
        acc("Revolut GBP", "2026-10-30T00:00:00Z"),
        acc("Fineco", "2026-10-25T00:00:00Z"),
      ],
      TODAY,
    );
    expect(alerts).toEqual([
      { bank: "Fineco", daysLeft: 2 },
      { bank: "Revolut", daysLeft: 7 },
    ]);
  });
});
