import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BROKERS, brokerTable } from "./index";
import { parseTradesCsv } from "@/lib/trades-csv";

const FIXTURES = path.resolve(__dirname, "fixtures");
const fixture = (id: string) => readFileSync(path.join(FIXTURES, `${id}.csv`), "utf8");
// A markdown table as rows of trimmed cells, so Prettier's column padding doesn't matter.
const tableCells = (md: string) =>
  md
    .split("\n")
    .filter((l) => l.startsWith("|") && !/^\|[\s|:-]+\|$/.test(l))
    .map((l) =>
      l
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim()),
    );
const header = (text: string) =>
  text
    .split(/\r?\n/)[0]!
    .split(",")
    .map((h) => h.replace(/"/g, "").toLowerCase());

describe("broker registry", () => {
  it.each(BROKERS.map((b) => [b.id, b]))("%s has a sample export and a unique id", (id) => {
    expect(() => fixture(id)).not.toThrow();
    expect(BROKERS.filter((b) => b.id === id)).toHaveLength(1);
  });

  it("every sample is recognised by exactly one parser, so two brokers never fight over a file", () => {
    for (const file of readdirSync(FIXTURES)) {
      const cells = header(readFileSync(path.join(FIXTURES, file), "utf8"));
      expect(BROKERS.filter((b) => b.detect(cells)).map((b) => b.id)).toEqual([
        file.replace(/\.csv$/, ""),
      ]);
    }
  });

  it("samples carry no personal data: no IBAN, email or phone number", () => {
    for (const file of readdirSync(FIXTURES)) {
      const text = readFileSync(path.join(FIXTURES, file), "utf8");
      expect(text).not.toMatch(/\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/); // IBAN
      expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/); // email
      expect(text).not.toMatch(/\+\d{2}\s?\d{3}/); // phone
    }
  });

  it("the public list in docs/BROKERS.md matches the code", () => {
    const doc = readFileSync(path.resolve(__dirname, "../../../docs/BROKERS.md"), "utf8");
    expect(tableCells(doc)).toEqual(tableCells(brokerTable()));
  });

  it("a broker only tested on its sample says so", () => {
    expect(brokerTable([{ ...BROKERS[0]!, verifiedAt: null }])).toMatch(/not yet, sample only/);
  });
});

describe("Trade Republic sample", () => {
  const ctx = {
    kind: "stock" as const,
    knownKeys: new Set(["XX0000000001", "XX0000000002"]),
    today: "2026-10-31",
  };

  it("reads every trade with Trade Republic's own id, and counts what it skipped", () => {
    const { trades, errors, notes } = parseTradesCsv(fixture("trade_republic"), ctx);
    expect(errors).toEqual([]);
    expect(trades).toHaveLength(4);
    expect(new Set(trades.map((t) => t.external_id)).size).toBe(4);
    expect(trades.every((t) => t.source === "trade_republic")).toBe(true);
    expect(notes).toContain(
      "2 rows that aren't trades were skipped (dividends, interest, card payments, transfers).",
    );
  });

  it("a file missing one of its columns isn't read as Trade Republic", () => {
    const text = fixture("trade_republic").replace('"currency",', '"ccy",');
    const result = parseTradesCsv(text, ctx);
    expect(result.trades).toEqual([]);
    expect(result.unknownFormat).toBe(true);
  });

  it("when you say it's from Trade Republic, it reads it as Trade Republic", () => {
    const { trades, errors } = parseTradesCsv(fixture("trade_republic"), ctx, BROKERS[0]);
    expect(errors).toEqual([]);
    expect(trades).toHaveLength(4);
  });

  it("when you say it's from Trade Republic but it isn't, it says so and imports nothing", () => {
    const plain = "date,side,isin,shares,price\n2026-01-02,buy,XX0000000001,1,100";
    const result = parseTradesCsv(plain, ctx, BROKERS[0]);
    expect(result.trades).toEqual([]);
    expect(result.unknownFormat).toBe(true);
    expect(result.errors[0]).toMatch(/doesn't look like a Trade Republic export/);
  });
});

describe("every broker", () => {
  it.each(BROKERS.map((b) => [b.name, b] as const))("%s says how to export its file", (_, b) => {
    expect(b.howToExport.length).toBeGreaterThan(0);
    expect(b.howToExport.every((step) => step.length > 0)).toBe(true);
  });
});
