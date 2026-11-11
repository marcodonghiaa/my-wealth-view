import { afterEach, describe, expect, it, vi } from "vitest";
import { formatDay } from "./date";
import {
  appLocale,
  dateLocale,
  formatNumber,
  formatPercent,
  formatQuantity,
  inputNumber,
  localeOverride,
  monthFirst,
  numberFormat,
  setLocaleOverride,
} from "./locale";
import { formatBookingDate, formatMoney } from "./transactions";
import { parseTypedAmount } from "./trades";
import { parseQuantity } from "./holdings";
import { parseOwed } from "./account-types";

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
    expect(formatMoney(1234.5, "EUR")).toBe("1.234,50\u00a0€");
    expect(formatDay("2026-03-03")).toBe("3 Mar 2026");
  });

  it("goes back to the browser when the choice is cleared", () => {
    setLocaleOverride("it-IT");
    setLocaleOverride("");
    expect(localeOverride()).toBe("");
    expect(appLocale()).toBe("en-GB");
  });

  it("polish-3 #18 falls back to en-GB when the browser reports a broken locale", () => {
    setBrowser("not a locale!!");
    expect(appLocale()).toBe("en-GB");
    expect(formatNumber(1.5, 1)).toBe("1.5");
  });

  it("polish-3 #17 doesn't throw on its first call when the runtime has no navigator.language", async () => {
    Object.defineProperty(navigator, "language", { value: undefined, configurable: true });
    vi.resetModules();
    const fresh = await import("./locale");
    expect(fresh.appLocale()).toBe("en-GB");
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

describe("when the browser blocks storage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("follows the browser and reports that the choice was not saved", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    setBrowser("de-DE");
    expect(appLocale()).toBe("de-DE");
    expect(setLocaleOverride("it-IT")).toBe(false);
  });
});

describe("US English dates", () => {
  it("put the month first, in English", () => {
    setBrowser("en-US");
    expect(formatDay("2026-03-03")).toBe("Mar 3, 2026");
    expect(formatBookingDate("2026-03-03")).toBe("Mar 3, 2026");
  });
});

describe("numberFormat", () => {
  it("reuses one formatter per locale and options", () => {
    const a = numberFormat({ style: "percent" });
    expect(numberFormat({ style: "percent" })).toBe(a);
    expect(numberFormat({ style: "decimal" })).not.toBe(a);
    setBrowser("de-DE");
    expect(numberFormat({ style: "percent" })).not.toBe(a);
    expect(numberFormat({ style: "percent" }).format(0.5)).toBe("50 %");
  });
});

describe("a planted locale value", () => {
  it("#8 can't switch the digits: only Settings choices count, extensions are dropped", () => {
    setLocaleOverride("de-DE-u-nu-arab");
    expect(appLocale()).toBe("en-GB");
    expect(formatNumber(12, 0)).toBe("12");
    setLocaleOverride("");
    setBrowser("de-DE-u-nu-arab");
    expect(appLocale()).toBe("de-DE");
  });
});

describe("formatQuantity", () => {
  it("polish-3 #7 writes shares and coins with up to N decimals the locale's way", () => {
    expect(formatQuantity(1.5, 8)).toBe("1.5");
    expect(formatQuantity(0.123456789, 8)).toBe("0.12345679");
    expect(formatQuantity(12.34567, 3)).toBe("12.346");
    expect(formatQuantity(1234, 3)).toBe("1,234");
    setBrowser("de-DE");
    expect(formatQuantity(1.5, 8)).toBe("1,5");
  });
});

describe("appLocale on a busy page", () => {
  afterEach(() => vi.restoreAllMocks());

  it("polish-3 #17 reads storage once, not on every figure", () => {
    setLocaleOverride("de-DE");
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    for (let i = 0; i < 100; i++) formatNumber(i, 2);
    expect(getItem.mock.calls.length).toBeLessThanOrEqual(1);
    expect(formatNumber(1.5, 2)).toBe("1,50");
  });
});

describe("thousands marks (polish-4 #3)", () => {
  it("groups 4-digit amounts too, so a column of figures lines up in every locale", () => {
    setLocaleOverride("it-IT");
    expect(formatMoney(3487, "EUR")).toBe("3487,00 €".replace("3487", "3.487"));
    expect(formatNumber(7022.35, 2)).toBe("7.022,35");
  });
});

describe("polish-5 #4 typed numbers follow the chosen format", () => {
  const parsers = { parseTypedAmount, parseQuantity, parseOwed };
  it.each(Object.entries(parsers))("%s reads thousands marks in the chosen format", (_n, parse) => {
    setLocaleOverride("it-IT");
    expect(parse("1.250.000")).toBe(1250000);
    expect(parse("1.250,5")).toBe(1250.5);
    expect(parse("12,5")).toBe(12.5);
    expect(parse("0.5")).toBe(0.5);
    setLocaleOverride("en-GB");
    expect(parse("1,250,000")).toBe(1250000);
    expect(parse("1,250.5")).toBe(1250.5);
    expect(parse("12.5")).toBe(12.5);
    expect(parse("0,5")).toBe(0.5);
    expect(parse("1,2,3")).toBeNull();
  });

  // "1.125" under Italian could be 1125 or a dot typed for 1,125: a wrong guess silently stores
  // 1000× the value, so a lone thousands mark with one group is refused, not guessed.
  it.each(Object.entries(parsers))(
    "polish-5 #4 audit: %s refuses 1.125 / 1,125 instead of guessing",
    (_n, parse) => {
      setLocaleOverride("it-IT");
      expect(parse("1.125")).toBeNull();
      setLocaleOverride("en-GB");
      expect(parse("1,125")).toBeNull();
    },
  );
});

describe("inputNumber", () => {
  it("polish-5 #4 audit 2: keeps every decimal of a coin quantity", () => {
    setLocaleOverride("it-IT");
    expect(inputNumber(0.123456789012)).toBe("0,123456789012");
    expect(inputNumber(1234.5)).toBe("1234,5");
  });
});
