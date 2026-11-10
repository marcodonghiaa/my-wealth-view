import { afterEach, describe, expect, it } from "vitest";
import { formatDay } from "./date";
import {
  appLocale,
  dateLocale,
  formatNumber,
  formatPercent,
  localeOverride,
  monthFirst,
  setLocaleOverride,
} from "./locale";
import { formatMoney } from "./transactions";

const setBrowser = (language: string) =>
  Object.defineProperty(navigator, "language", { value: language, configurable: true });

afterEach(() => {
  setLocaleOverride("");
  setBrowser("en-GB");
});

describe("appLocale", () => {
  it("follows the browser", () => {
    setBrowser("de-DE");
    expect(appLocale()).toBe("de-DE");
    expect(formatMoney(1234.5, "EUR")).toBe("1.234,50\u00a0€");
    // Month names stay English: the UI is English.
    expect(formatDay("2026-03-03")).toBe("3 Mar 2026");
  });

  it("prefers the Settings choice over the browser", () => {
    setBrowser("en-US");
    setLocaleOverride("it-IT");
    expect(localeOverride()).toBe("it-IT");
    expect(formatMoney(1234.5, "EUR")).toBe("1234,50\u00a0€");
    expect(formatDay("2026-03-03")).toBe("3 Mar 2026");
  });

  it("goes back to the browser when the choice is cleared", () => {
    setLocaleOverride("it-IT");
    setLocaleOverride("");
    expect(localeOverride()).toBe("");
    expect(appLocale()).toBe("en-GB");
  });

  it("falls back to en-GB on a broken value", () => {
    setBrowser("");
    expect(appLocale()).toBe("en-GB");
    setLocaleOverride("not a locale!!");
    expect(appLocale()).toBe("en-GB");
  });
});

describe("monthFirst", () => {
  it("is true only for US English", () => {
    expect(monthFirst("en-US")).toBe(true);
    expect(monthFirst("en-GB")).toBe(false);
    expect(monthFirst("de-DE")).toBe(false);
  });
});

describe("formatPercent", () => {
  it("writes a fraction as a percent the locale's way", () => {
    expect(formatPercent(0.2548)).toBe("25.5%");
    expect(formatPercent(0.2548, { digits: 2 })).toBe("25.48%");
    setBrowser("de-DE");
    expect(formatPercent(0.2548)).toBe("25,5\u00a0%");
  });

  it("signs a change with + and a real minus, nothing on zero", () => {
    expect(formatPercent(0.012, { signed: true })).toBe("+1.2%");
    expect(formatPercent(-0.012, { signed: true })).toBe("−1.2%");
    expect(formatPercent(0, { signed: true })).toBe("0.0%");
  });
});

describe("dateLocale", () => {
  it("keeps month names English in the reader's order", () => {
    expect(dateLocale("en-US")).toBe("en-US");
    expect(dateLocale("de-DE")).toBe("en-GB");
    expect(dateLocale("it-IT")).toBe("en-GB");
  });
});

describe("formatNumber", () => {
  it("writes fixed decimals the locale's way", () => {
    expect(formatNumber(1.08424, 4)).toBe("1.0842");
    setBrowser("it-IT");
    expect(formatNumber(1.08424, 4)).toBe("1,0842");
  });
});
