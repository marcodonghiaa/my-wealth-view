import { afterEach, describe, expect, it } from "vitest";
import { setLocaleOverride } from "@/lib/locale";
import { categoryColor } from "@/lib/categories";
import {
  buildFlow,
  fitLabel,
  firstMonth,
  formatRate,
  FROM_SAVINGS,
  incomeBySource,
  OTHER_INCOME,
  OTHER_SPENDING,
  periodLabel,
  periodRange,
  periodStart,
  SAVED,
  savingsRate,
  shiftPeriod,
  shortPeriodLabel,
  switchPeriod,
  spendByCategory,
  summarize,
  topParts,
  trend,
  trimLeadingEmpty,
  type MonthlyFlowRow,
} from "./cash-flow";

const d = (y: number, m: number, day = 1) => new Date(y, m - 1, day);

describe("periods", () => {
  it("starts a month, quarter or year at its first day", () => {
    expect(periodStart(d(2026, 11, 17), "month")).toEqual(d(2026, 11));
    expect(periodStart(d(2026, 11, 17), "quarter")).toEqual(d(2026, 10));
    expect(periodStart(d(2026, 3, 31), "quarter")).toEqual(d(2026, 1));
    expect(periodStart(d(2026, 11, 17), "year")).toEqual(d(2026, 1));
  });

  it("steps across year ends", () => {
    expect(shiftPeriod(d(2026, 1), "month", -1)).toEqual(d(2025, 12));
    expect(shiftPeriod(d(2026, 10), "quarter", 1)).toEqual(d(2027, 1));
    expect(shiftPeriod(d(2026, 1), "year", -2)).toEqual(d(2024, 1));
  });

  it("gives an end-exclusive ISO range", () => {
    expect(periodRange(d(2026, 12), "month")).toEqual({ from: "2026-12-01", to: "2027-01-01" });
    expect(periodRange(d(2026, 4), "quarter")).toEqual({ from: "2026-04-01", to: "2026-07-01" });
    expect(periodRange(d(2026, 1), "year")).toEqual({ from: "2026-01-01", to: "2027-01-01" });
  });

  it("labels each period", () => {
    expect(periodLabel(d(2026, 11), "month", "en-GB")).toBe("November 2026");
    expect(periodLabel(d(2026, 10), "quarter")).toBe("Q4 2026");
    expect(periodLabel(d(2026, 1), "year")).toBe("2026");
    expect(shortPeriodLabel(d(2026, 11), "month", "en-GB")).toBe("Nov");
    expect(shortPeriodLabel(d(2026, 4), "quarter")).toBe("Q2 '26");
    expect(shortPeriodLabel(d(2025, 1), "year")).toBe("2025");
  });
});

// Polish 1 #6: Year → Month landed on January, possibly before any data.
describe("switchPeriod", () => {
  const today = d(2026, 11, 11);
  it("widens to the period that holds the one you were on", () => {
    expect(switchPeriod(d(2026, 3), "month", "quarter", today)).toEqual(d(2026, 1));
    expect(switchPeriod(d(2026, 4), "quarter", "year", today)).toEqual(d(2026, 1));
  });
  it("narrows to today's month or quarter when the period holds today", () => {
    expect(switchPeriod(d(2026, 1), "year", "month", today)).toEqual(d(2026, 11));
    expect(switchPeriod(d(2026, 1), "year", "quarter", today)).toEqual(d(2026, 10));
    expect(switchPeriod(d(2026, 10), "quarter", "month", today)).toEqual(d(2026, 11));
  });
  it("narrows to the last month or quarter of a past period", () => {
    expect(switchPeriod(d(2025, 1), "year", "month", today)).toEqual(d(2025, 12));
    expect(switchPeriod(d(2025, 1), "year", "quarter", today)).toEqual(d(2025, 10));
    expect(switchPeriod(d(2026, 4), "quarter", "month", today)).toEqual(d(2026, 6));
  });
  it("keeps the period when it doesn't change", () => {
    expect(switchPeriod(d(2026, 4), "quarter", "quarter", today)).toEqual(d(2026, 4));
  });
});

describe("savingsRate / formatRate", () => {
  afterEach(() => setLocaleOverride(""));
  // Polish 1 #8: the rate follows the number format chosen in Settings, like every other percent.
  it("formats the rate in the chosen locale", () => {
    setLocaleOverride("de-DE");
    expect(formatRate(0.254)).toBe("25\u00a0%");
    expect(formatRate(-0.2)).toBe("−20\u00a0%");
  });
  // Re-audit: −0.5% rounds to −0 in Math.round, which hid the minus and showed "1%".
  it("keeps the minus on a half-percent overspend", () => {
    setLocaleOverride("en-GB");
    expect(formatRate(-0.005)).toBe("−1%");
  });

  it("shows no minus for a rate that rounds to zero", () => {
    setLocaleOverride("en-GB");
    expect(formatRate(-0.004)).toBe("0%");
  });
  it("is the share of income kept", () => {
    expect(savingsRate(2000, 1500)).toBe(0.25);
  });
  it("goes negative when spending beats income", () => {
    expect(savingsRate(1000, 1200)).toBeCloseTo(-0.2);
  });
  it("is null with no income", () => {
    expect(savingsRate(0, 300)).toBeNull();
    expect(savingsRate(-5, 0)).toBeNull();
  });
  it("formats with a real minus and a dash for none", () => {
    expect(formatRate(0.254)).toBe("25%");
    expect(formatRate(-0.2)).toBe("−20%");
    expect(formatRate(null)).toBe("—");
    expect(formatRate(0)).toBe("0%");
  });
});

const rows: Array<MonthlyFlowRow> = [
  { month: "2026-08-01", income_eur: 2000, expenses_eur: 1500 },
  { month: "2026-09-01", income_eur: 2000, expenses_eur: 2500 },
  { month: "2026-10-01", income_eur: 3000, expenses_eur: 1000 },
  { month: "2026-11-01", income_eur: null, expenses_eur: null },
  { month: null, income_eur: 999, expenses_eur: 999 },
];

describe("summarize", () => {
  it("adds up the months in range only", () => {
    expect(summarize(rows, "2026-09-01", "2026-11-01")).toEqual({
      income: 5000,
      spending: 3500,
      net: 1500,
      savingsRate: 0.3,
      months: 2,
    });
  });
  it("does not count an empty month as a month", () => {
    const s = summarize(rows, "2026-11-01", "2026-12-01");
    expect(s).toEqual({ income: 0, spending: 0, net: 0, savingsRate: null, months: 0 });
  });
});

describe("trend", () => {
  it("returns count periods oldest first, ending at last", () => {
    const bars = trend(rows, "month", d(2026, 10), 3);
    expect(bars.map((b) => b.key)).toEqual(["2026-08-01", "2026-09-01", "2026-10-01"]);
    expect(bars.map((b) => b.net)).toEqual([500, -500, 2000]);
  });
  it("sums quarters", () => {
    const [q3] = trend(rows, "quarter", d(2026, 7), 1);
    expect(q3).toMatchObject({ key: "2026-07-01", income: 4000, spending: 4000, net: 0 });
  });
});

describe("firstMonth", () => {
  it("is the earliest month with money in or out", () => {
    expect(firstMonth([{ month: "2026-02-01", income_eur: 0, expenses_eur: 0 }, ...rows])).toBe(
      "2026-08-01",
    );
  });
  it("is null with no data", () => {
    expect(firstMonth([])).toBeNull();
  });
});

describe("incomeBySource", () => {
  it("names each source by its payer when the bank gives one", () => {
    expect(
      incomeBySource([
        {
          payer_name: "Acme Srl",
          creditor_name: "Me",
          category: "Income",
          personal_signed_amount_eur: 2000,
        },
        {
          payer_name: "Client B",
          creditor_name: "Me",
          category: "Income",
          personal_signed_amount_eur: 500,
        },
      ]),
    ).toEqual([
      { name: "Acme Srl", value: 2000 },
      { name: "Client B", value: 500 },
    ]);
  });

  it("groups by payer, falls back to category, skips non-positive rows", () => {
    expect(
      incomeBySource([
        { creditor_name: "Employer", category: "Income", personal_signed_amount_eur: 2000 },
        { creditor_name: "Employer", category: "Income", personal_signed_amount_eur: 2000 },
        { creditor_name: null, category: "Interest", personal_signed_amount_eur: 12 },
        { creditor_name: null, category: null, personal_signed_amount_eur: 5 },
        { creditor_name: "Zero", category: null, personal_signed_amount_eur: 0 },
        { creditor_name: "Null", category: null, personal_signed_amount_eur: null },
      ]),
    ).toEqual([
      { name: "Employer", value: 4000 },
      { name: "Interest", value: 12 },
      { name: "Unlabelled income", value: 5 },
    ]);
  });
});

describe("spendByCategory", () => {
  it("sums the range per category and skips months without live spending", () => {
    const totals = new Map([
      ["2026-09-01", 300],
      ["2026-10-01", 250],
    ]);
    expect(
      spendByCategory(
        [
          { month: "2026-09-01", category: "Groceries", spend_eur: 300 },
          { month: "2026-10-01", category: "Groceries", spend_eur: 200 },
          { month: "2026-10-01", category: null, spend_eur: 50 },
          { month: "2026-10-01", category: "Health", spend_eur: null },
          { month: "2026-08-01", category: "Housing", spend_eur: 900 }, // imported history month
          { month: null, category: "Housing", spend_eur: 900 },
        ],
        totals,
      ),
    ).toEqual([
      { name: "Groceries", value: 500 },
      { name: "Uncategorized", value: 50 },
    ]);
  });

  // Polish 1 #1: a Splitwise share makes the month count, but the category view also adds the
  // imported history there (no bank spend), so its rows outgrow the month's total.
  it("leaves out a month whose categories don't add up to its total", () => {
    const totals = new Map([
      ["2026-03-01", 300],
      ["2026-04-01", 100],
    ]);
    expect(
      spendByCategory(
        [
          { month: "2026-03-01", category: "Groceries", spend_eur: 1500 },
          { month: "2026-03-01", category: "Housing", spend_eur: 750 },
          { month: "2026-03-01", category: "Dine Out", spend_eur: 300 },
          { month: "2026-04-01", category: "Dine Out", spend_eur: 100.004 },
        ],
        totals,
      ),
    ).toEqual([{ name: "Dine Out", value: 100.004 }]);
  });
});

describe("topParts", () => {
  const parts = [
    { name: "a", value: 50 },
    { name: "b", value: 30 },
    { name: "c", value: 15 },
    { name: "d", value: 5 },
  ];
  it("folds the tail into one rest part", () => {
    expect(topParts(parts, 100, 2, "rest")).toEqual([
      { name: "a", value: 50 },
      { name: "b", value: 30 },
      { name: "rest", value: 20 },
    ]);
  });
  it("keeps a lone extra part rather than renaming it 'rest'", () => {
    expect(topParts(parts, 100, 3, "rest").map((p) => p.name)).toEqual(["a", "b", "c", "d"]);
  });
  it("tops up the rest when the parts fall short of the total", () => {
    expect(topParts([{ name: "a", value: 60 }], 100, 3, "rest")).toEqual([
      { name: "a", value: 60 },
      { name: "rest", value: 40 },
    ]);
  });
  it("adds nothing for sub-cent rounding, and drops sub-cent parts", () => {
    expect(
      topParts(
        [
          { name: "a", value: 100 },
          { name: "dust", value: 0.001 },
        ],
        100.004,
        3,
        "rest",
      ),
    ).toEqual([{ name: "a", value: 100 }]);
  });
});

const sum = (xs: Array<number>) => xs.reduce((s, x) => s + x, 0);

describe("buildFlow", () => {
  // Polish 1 #13: a period that breaks even to the cent draws neither Saved nor From savings.
  it("adds no Saved or From savings node when the period breaks even", () => {
    const g = buildFlow({
      income: 100,
      spending: 100.004,
      sources: [{ name: "Employer", value: 100 }],
      categories: [{ name: "Groceries", value: 100.004 }],
    });
    expect(g.nodes.map((n) => n.kind)).toEqual(["income", "hub", "spend"]);
  });

  it("greys out Other spending and colours categories as everywhere else", () => {
    const g = buildFlow({
      income: 0,
      spending: 300,
      sources: [],
      categories: [{ name: "Groceries", value: 100 }],
    });
    const color = (name: string) => g.nodes.find((n) => n.name === name)?.color;
    expect(color("Groceries")).toBe(categoryColor("Groceries"));
    expect(color(OTHER_SPENDING)).toBe(categoryColor(null));
    expect(color(FROM_SAVINGS)).toBe("var(--color-negative)");
  });

  it("is empty with no money in or out", () => {
    expect(buildFlow({ income: 0, spending: 0, sources: [], categories: [] })).toEqual({
      nodes: [],
      links: [],
    });
  });

  it("sends income through the hub to categories and Saved; both sides balance", () => {
    const g = buildFlow({
      income: 3000,
      spending: 2000,
      sources: [{ name: "Employer", value: 3000 }],
      categories: [
        { name: "Housing", value: 1200 },
        { name: "Groceries", value: 800 },
      ],
    });
    expect(g.nodes.map((n) => [n.name, n.kind])).toEqual([
      ["Employer", "income"],
      ["Income", "hub"],
      ["Housing", "spend"],
      ["Groceries", "spend"],
      [SAVED, "saved"],
    ]);
    const hub = 1;
    const into = sum(g.links.filter((l) => l.target === hub).map((l) => l.value));
    const out = sum(g.links.filter((l) => l.source === hub).map((l) => l.value));
    expect(into).toBe(3000);
    expect(out).toBe(3000);
    expect(g.links.find((l) => g.nodes[l.target]!.name === SAVED)?.value).toBe(1000);
    // Money in and money kept share the gain colour.
    expect(g.nodes[0]!.color).toBe("var(--color-positive)");
    expect(g.nodes.find((n) => n.name === SAVED)?.color).toBe("var(--color-positive)");
  });

  it("draws from savings when spending beats income", () => {
    const g = buildFlow({
      income: 1000,
      spending: 1500,
      sources: [{ name: "Employer", value: 1000 }],
      categories: [{ name: "Housing", value: 1500 }],
    });
    expect(g.nodes.map((n) => n.name)).toEqual(["Employer", FROM_SAVINGS, "Income", "Housing"]);
    expect(g.links).toEqual([
      { source: 0, target: 2, value: 1000 },
      { source: 1, target: 2, value: 500 },
      { source: 2, target: 3, value: 1500 },
    ]);
  });

  it("works with spending but no income", () => {
    const g = buildFlow({
      income: 0,
      spending: 40,
      sources: [],
      categories: [{ name: "Groceries", value: 40 }],
    });
    expect(g.nodes.map((n) => n.name)).toEqual([FROM_SAVINGS, "Income", "Groceries"]);
  });

  it("reconciles short sides with Other income / Other spending and caps the node count", () => {
    const categories = Array.from({ length: 10 }, (_, i) => ({ name: `C${i}`, value: 100 }));
    const g = buildFlow({
      income: 2000,
      spending: 1100,
      sources: [{ name: "Employer", value: 1500 }],
      categories,
      maxCategories: 7,
    });
    const names = g.nodes.map((n) => n.name);
    expect(names).toContain(OTHER_INCOME);
    expect(names).toContain(OTHER_SPENDING);
    expect(g.nodes.filter((n) => n.kind === "spend")).toHaveLength(8);
    const other = g.links.find((l) => g.nodes[l.target]!.name === OTHER_SPENDING)!;
    expect(other.value).toBe(400); // 3 folded categories + 100 not in any category
  });
});

describe("fitLabel", () => {
  it("keeps short names and cuts long ones with an ellipsis", () => {
    expect(fitLabel("Housing", 13)).toBe("Housing");
    expect(fitLabel("A very long employer name", 13)).toBe("A very long…");
  });

  // Polish 1 #16: cut whole characters, never half an emoji or an accent.
  it("never splits an emoji or an accented letter on the cut", () => {
    expect(fitLabel("ab🍕cd", 4)).toBe("ab🍕…");
    expect(fitLabel("ab👨‍👩‍👧cd", 4)).toBe("ab👨‍👩‍👧…");
    expect(fitLabel("Cafe\u0301 Zu\u0308rich", 5)).toBe("Cafe\u0301…"); // accents typed as two characters
    expect(fitLabel("Café Zürich", 5)).toBe("Café…");
    expect(fitLabel("🍕🍕🍕", 3)).toBe("🍕🍕🍕");
  });
});

describe("trimLeadingEmpty", () => {
  const bars = trend(rows, "month", d(2026, 11), 6); // Jun..Nov; data Aug..Oct
  it("drops empty periods before the first with data, keeps later gaps", () => {
    expect(trimLeadingEmpty(bars).map((b) => b.key)).toEqual([
      "2026-08-01",
      "2026-09-01",
      "2026-10-01",
      "2026-11-01",
    ]);
  });
  it("keeps everything when all are empty or the first has data", () => {
    expect(trimLeadingEmpty(trend([], "year", d(2026, 1), 3))).toHaveLength(3);
    expect(trimLeadingEmpty(bars.slice(2))).toHaveLength(4);
  });
});
