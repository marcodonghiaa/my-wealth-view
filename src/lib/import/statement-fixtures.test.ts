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
    expect(s.rows).toEqual([
      row("2026-03-03", "Coffee Corner", 3.2, "DBIT"),
      row("2026-03-01", "Top-up by *1234", 1000, "CRDT"),
      row("2026-03-04", "To Example Person", 50.5, "DBIT"),
    ]);
    expect(s.skipped).toBe(2);
  });

  it("Spiir: day-first dates, decimal comma, Spiir's own duplicates left out", () => {
    const s = readStatement(fixture("spiir.csv"));
    expect(s.preset).toBe("Spiir");
    expect(s.dateOrder).toBe("DMY");
    expect(s.decimal).toBe(",");
    expect(s.rows).toEqual([
      row("2026-02-28", "Netto", 245.5, "DBIT"),
      row("2026-02-27", "LØN FEBRUAR", 25000, "CRDT"),
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
    expect(picked.rows.map((r) => [r.description, r.amount])).toEqual([
      ["CARD_PAYMENT", 3.2],
      ["TOPUP", 1000],
      ["TRANSFER", 50.5],
    ]);
    const firefly = readStatement(fixture("firefly.csv"));
    expect(readStatement(fixture("firefly.csv"), firefly.columns).rows).toEqual(firefly.rows);
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
