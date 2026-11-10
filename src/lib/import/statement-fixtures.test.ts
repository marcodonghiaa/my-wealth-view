// Real-shaped exports (no personal data) for every preset and three messy generic statements.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { decodeCsv } from "./parse-csv";
import { readStatement } from "./statement";
import { findPreset, PRESETS } from "./statement-presets";

const fixture = (name: string) =>
  decodeCsv(readFileSync(path.resolve(__dirname, "fixtures", name)));

const row = (date: string, description: string, amount: number, direction: "DBIT" | "CRDT") => ({
  date,
  description,
  amount,
  direction,
});

describe("presets", () => {
  it("Revolut: completed date, fee added to the charge, pending and declined left out", () => {
    const s = readStatement(fixture("revolut.csv"));
    expect(s.preset).toBe("Revolut");
    expect(s.rows.slice(0, 3)).toEqual([
      row("2026-03-03", "Coffee Corner", 3.2, "DBIT"),
      row("2026-03-01", "Top-up by *1234", 1000, "CRDT"),
      row("2026-03-04", "To Example Person", 50.5, "DBIT"),
    ]);
    expect(s.skipped).toBe(2);
  });

  it("Revolut: keeps each row's currency, exchanges and pocket moves are transfers", () => {
    expect(readStatement(fixture("revolut.csv")).rows.slice(3)).toEqual([
      { ...row("2026-03-06", "Exchanged to USD", 100, "DBIT"), category: "Transfer" },
      {
        ...row("2026-03-06", "Exchanged from EUR", 108, "CRDT"),
        currency: "USD",
        category: "Transfer",
      },
      { ...row("2026-03-07", "Book Shop", 30, "DBIT"), currency: "USD" },
      { ...row("2026-03-08", "To EUR Savings", 500, "CRDT"), category: "Transfer" },
    ]);
  });

  it("#9 Revolut: both sides of a move to or from Savings, a pocket or a Vault are transfers", () => {
    const head = fixture("revolut.csv").split("\n")[0];
    const csv = [
      head,
      "TRANSFER,Current,2026-03-08 09:00:00,2026-03-08 09:00:00,To EUR Savings,-500.00,0.00,EUR,COMPLETED,446.30",
      "TRANSFER,Current,2026-03-09 09:00:00,2026-03-09 09:00:00,From pocket EUR Holiday,20.00,0.00,EUR,COMPLETED,466.30",
      "TRANSFER,Current,2026-03-10 09:00:00,2026-03-10 09:00:00,To Vault Rainy day,-5.00,0.00,EUR,COMPLETED,461.30",
      "TRANSFER,Current,2026-03-11 09:00:00,2026-03-11 09:00:00,To Savings Bank Ltd,-40.00,0.00,EUR,COMPLETED,421.30",
    ].join("\n");
    expect(readStatement(csv).rows.map((r) => r.category ?? null)).toEqual([
      "Transfer",
      "Transfer",
      "Transfer",
      null,
    ]);
  });

  it("Spiir: day-first dates, decimal comma, Spiir's own duplicates left out", () => {
    const s = readStatement(fixture("spiir.csv"));
    expect(s.preset).toBe("Spiir");
    expect(s.dateOrder).toBe("DMY");
    expect(s.decimal).toBe(",");
    expect(s.rows).toEqual([
      { ...row("2026-02-28", "Netto", 245.5, "DBIT"), currency: "DKK" },
      { ...row("2026-02-27", "LØN FEBRUAR", 25000, "CRDT"), currency: "DKK" },
    ]);
  });

  it("Actual Budget: payee, or notes when there is no payee", () => {
    const s = readStatement(fixture("actual.csv"));
    expect(s.preset).toBe("Actual Budget");
    expect(s.rows).toEqual([
      row("2026-01-15", "Grocery Store", 54.32, "DBIT"),
      row("2026-01-31", "Salary January", 2500, "CRDT"),
      row("2026-01-20", "Electric Co", 61.07, "DBIT"),
    ]);
  });

  it("Firefly III: direction from the type, transfers and opening balances left out", () => {
    const s = readStatement(fixture("firefly.csv"));
    expect(s.preset).toBe("Firefly III");
    expect(s.rows).toEqual([
      row("2026-02-01", "Groceries", 23.45, "DBIT"),
      row("2026-02-02", "Salary", 1800, "CRDT"),
    ]);
    expect(s.skipped).toBe(2);
  });

  it("keeps a preset's rules when a column is picked by hand", () => {
    const auto = readStatement(fixture("revolut.csv"));
    const picked = readStatement(fixture("revolut.csv"), { ...auto.columns, description: 0 });
    expect(picked.preset).toBe("Revolut");
    expect(picked.rows.slice(0, 3).map((r) => [r.description, r.amount])).toEqual([
      ["CARD_PAYMENT", 3.2],
      ["TOPUP", 1000],
      ["TRANSFER", 50.5],
    ]);
    expect(picked.rows).toHaveLength(7);
    const firefly = readStatement(fixture("firefly.csv"));
    expect(readStatement(fixture("firefly.csv"), firefly.columns).rows).toEqual(firefly.rows);
  });

  it("reads a generic currency column; EUR or a non-code stays the default", () => {
    const csv =
      "Date;Description;Amount;Währung\n2026-01-02;Shop;-5,00;chf\n2026-01-03;Bar;-2,00;EUR\n2026-01-04;Odd;-1,00;?";
    expect(readStatement(csv).rows.map((r) => r.currency)).toEqual(["CHF", undefined, undefined]);
  });

  it("reads a Type column of DEBIT/CREDIT next to an unsigned amount", () => {
    const csv =
      "Date,Description,Amount,Type\n2026-01-02,Shop,12.50,DEBIT\n2026-01-03,Pay,100,CREDIT";
    expect(readStatement(csv).rows.map((r) => r.direction)).toEqual(["DBIT", "CRDT"]);
  });

  it("never lets two presets claim the same file", () => {
    for (const p of PRESETS) {
      const others = PRESETS.filter((o) => o !== p);
      expect(findPreset(p.requires, others)).toBeNull();
    }
  });
});

describe("messy generic statements", () => {
  it("German, Windows-1252, title lines, Soll/Haben marker, payee falls back to purpose", () => {
    const s = readStatement(fixture("messy-de-windows1252.csv"));
    expect(s.preset).toBeNull();
    expect(s.headers[2]).toBe("Begünstigter/Zahlungspflichtiger");
    expect(s.rows).toEqual([
      row("2026-02-03", "Bäckerei Müller", 3.8, "DBIT"),
      row("2026-02-14", "Arbeitgeber GmbH", 3100, "CRDT"),
      row("2026-02-20", "Kontoführung", 4.95, "DBIT"),
    ]);
    expect(s.skipped).toBe(1); // closing balance line
  });

  it("keeps the real header line when columns are picked on a file with title lines", () => {
    const auto = readStatement(fixture("messy-us-card.csv"));
    const picked = readStatement(fixture("messy-us-card.csv"), auto.columns);
    expect(picked.headers[0]).toBe("Transaction Date");
    expect(picked.rows).toEqual(auto.rows);
  });

  it("US card: month-first dates, $ and (negative) amounts, quoted commas, total line", () => {
    const s = readStatement(fixture("messy-us-card.csv"));
    expect(s.dateOrder).toBe("MDY");
    expect(s.rows).toEqual([
      row("2026-01-02", "COFFEE SHOP, DOWNTOWN", 4.75, "DBIT"),
      row("2026-01-13", "ONLINE STORE", 1249.99, "DBIT"),
      row("2026-01-20", "PAYMENT THANK YOU", 500, "CRDT"),
    ]);
    expect(s.skipped).toBe(1);
  });

  it("Dutch: compact dates, Af/Bij marker, Bedrag (EUR) with decimal comma", () => {
    const s = readStatement(fixture("messy-nl-ing.csv"));
    expect(s.columns.direction).toBe(5);
    expect(s.rows).toEqual([
      row("2026-03-05", "Albert Heijn 1234", 23.45, "DBIT"),
      row("2026-03-01", "Werkgever BV", 2750, "CRDT"),
      row("2026-03-02", "Kosten pakket", 4.1, "DBIT"),
    ]);
  });
});

describe("a preset's skip column missing from the file", () => {
  it("keeps every row instead of dropping them", () => {
    const csv =
      "Date,Description,Amount,MainCategoryName\n2026-01-02,Shop,-10.00,Food\n2026-01-03,Pay,5.00,Income";
    const s = readStatement(csv);
    expect(s.preset).toBe("Spiir");
    expect(s.rows).toHaveLength(2);
    expect(s.skipped).toBe(0);
  });
});
