import { describe, expect, it } from "vitest";
import { dedupeKey, guessStatementColumns, parseDay, readStatement } from "./statement";

describe("parseDay", () => {
  it("reads ISO, European and Excel dates", () => {
    expect(parseDay("2026-04-25")).toBe("2026-04-25");
    expect(parseDay("25/04/2026")).toBe("2026-04-25");
    expect(parseDay("25.04.2026")).toBe("2026-04-25");
    expect(parseDay("25-04-26")).toBe("2026-04-25");
    expect(parseDay("46137")).toBe("2026-04-25");
    expect(parseDay("2026-04-25 10:31")).toBe("2026-04-25");
  });

  it("refuses what is not a real day", () => {
    expect(parseDay("31/02/2026")).toBeNull();
    expect(parseDay("hello")).toBeNull();
    expect(parseDay("")).toBeNull();
  });
});

describe("guessStatementColumns", () => {
  it("finds Italian bank columns with separate in and out", () => {
    expect(
      guessStatementColumns([
        "Data",
        "Data valuta",
        "Entrate",
        "Uscite",
        "Descrizione",
        "Descrizione completa",
      ]),
    ).toEqual({ date: 0, description: 4, amount: null, in: 2, out: 3 });
  });

  it("finds a signed amount column", () => {
    expect(guessStatementColumns(["Date", "Description", "Amount", "Currency"])).toEqual({
      date: 0,
      description: 1,
      amount: 2,
      in: null,
      out: null,
    });
  });
});

const fineco = [
  "Conto Corrente: 1234",
  "Periodo: 01/04/2026 - 30/04/2026",
  "",
  "Data;Data valuta;Entrate;Uscite;Descrizione;Descrizione completa",
  "25/04/2026;25/04/2026;;45,50;Pagamento POS;Ristorante Mario",
  "24/04/2026;24/04/2026;5.000,00;;Bonifico;Da papà",
  "23/04/2026;23/04/2026;;;Riga vuota;",
  "Saldo finale;;;;;",
].join("\n");

describe("readStatement", () => {
  it("skips the bank's title lines, reads in/out and drops rows with no amount or date", () => {
    const result = readStatement(fineco);
    expect(result.rows).toEqual([
      { date: "2026-04-25", description: "Pagamento POS", amount: 45.5, direction: "DBIT" },
      { date: "2026-04-24", description: "Bonifico", amount: 5000, direction: "CRDT" },
    ]);
    expect(result.skipped).toBe(2);
    expect(result.headers[0]).toBe("Data");
  });

  it("reads a signed amount: negative is money out", () => {
    const csv = "Date,Description,Amount\n2026-04-25,Coffee,-2.50\n2026-04-26,Salary,1500";
    expect(readStatement(csv).rows).toEqual([
      { date: "2026-04-25", description: "Coffee", amount: 2.5, direction: "DBIT" },
      { date: "2026-04-26", description: "Salary", amount: 1500, direction: "CRDT" },
    ]);
  });

  it("uses columns picked by hand", () => {
    const csv = "Quando,Cosa,Quanto\n2026-04-25,Coffee,-2.50";
    expect(() => readStatement(csv)).toThrow(/columns/i);
    const result = readStatement(csv, { date: 0, description: 1, amount: 2, in: null, out: null });
    expect(result.rows).toHaveLength(1);
  });
});

describe("dedupeKey", () => {
  it("matches the same transaction whatever the case, spacing or amount format", () => {
    expect(
      dedupeKey({
        date: "2026-04-25",
        description: " Coffee  Bar",
        amount: 2.5,
        direction: "DBIT",
      }),
    ).toBe(
      dedupeKey({ date: "2026-04-25", description: "coffee bar", amount: 2.5, direction: "DBIT" }),
    );
    expect(
      dedupeKey({ date: "2026-04-25", description: "Coffee", amount: 2.5, direction: "DBIT" }),
    ).not.toBe(
      dedupeKey({ date: "2026-04-25", description: "Coffee", amount: 2.5, direction: "CRDT" }),
    );
  });
});
