import { describe, expect, it, vi } from "vitest";
import {
  currencyCode,
  dedupeKey,
  detectDateOrder,
  guessStatementColumns,
  parseDay,
  readStatement,
} from "./statement";

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
    ).toEqual({ date: 0, description: 4, amount: null, direction: null, in: 2, out: 3 });
  });

  it("finds a signed amount column", () => {
    expect(guessStatementColumns(["Date", "Description", "Amount", "Currency"])).toEqual({
      date: 0,
      description: 1,
      amount: 2,
      direction: null,
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

describe("currencyCode", () => {
  it("reads codes and the two unambiguous symbols", () => {
    expect(currencyCode(" dkk ")).toBe("DKK");
    expect(currencyCode("€")).toBe("EUR");
    expect(currencyCode("£")).toBe("GBP");
    expect(currencyCode("$")).toBeUndefined();
    expect(currencyCode("25/04/2026")).toBeUndefined();
  });
});

describe("dedupeKey", () => {
  it("tells the same amount in two currencies apart", () => {
    const base = {
      date: "2026-04-25",
      description: "Shop",
      amount: 10,
      direction: "DBIT" as const,
    };
    expect(dedupeKey(base)).toBe(dedupeKey({ ...base, currency: "EUR" }));
    expect(dedupeKey(base)).not.toBe(dedupeKey({ ...base, currency: "USD" }));
  });

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

describe("parseDay, more formats", () => {
  it("reads month-first dates when told", () => {
    expect(parseDay("03/04/2026", "MDY")).toBe("2026-03-04");
    expect(parseDay("03/04/2026", "DMY")).toBe("2026-04-03");
    expect(parseDay("13/04/2026", "MDY")).toBeNull();
  });

  it("puts two-digit years from 70 in the 1900s", () => {
    expect(parseDay("31/12/99")).toBe("1999-12-31");
    // 69 means 2069, which #2 now rejects as a future year.
    expect(parseDay("31/12/69")).toBeNull();
    expect(parseDay("01/02/26")).toBe("2026-02-01");
  });

  it("reads compact, slashed-ISO and named-month dates", () => {
    expect(parseDay("20260304")).toBe("2026-03-04");
    expect(parseDay("2026/03/04")).toBe("2026-03-04");
    expect(parseDay("4 Mar 2026")).toBe("2026-03-04");
    expect(parseDay("04-Mar-26")).toBe("2026-03-04");
    expect(parseDay("4. März 2026")).toBe("2026-03-04");
    expect(parseDay("Mar 4, 2026")).toBe("2026-03-04");
    expect(parseDay("4 Foo 2026")).toBeNull();
    expect(parseDay("4 Mar 2026 10:15")).toBe("2026-03-04");
    expect(parseDay("4 février 2026")).toBe("2026-02-04");
    expect(parseDay("4 juillet 2026")).toBe("2026-07-04");
    expect(parseDay("4 décembre 2026")).toBe("2026-12-04");
    expect(parseDay("4 septiembre 2026")).toBe("2026-09-04");
    expect(parseDay("4 maart 2026")).toBe("2026-03-04");
    expect(parseDay("4 januari 2026")).toBe("2026-01-04");
    // macOS can write "ä" as "a" + a combining mark.
    expect(parseDay("4. Ma\u0308rz 2026")).toBe("2026-03-04");
    expect(parseDay("4 déc. 2026")).toBe("2026-12-04");
    expect(parseDay("20261340")).toBeNull();
  });
});

describe("detectDateOrder", () => {
  it("reads the order from a day above 12", () => {
    expect(detectDateOrder(["01/02/2026", "25/02/2026"], "en-US")).toBe("DMY");
    expect(detectDateOrder(["01/02/2026", "02/25/2026"], "en-GB")).toBe("MDY");
  });

  it("lets the locale decide when every date fits both", () => {
    expect(detectDateOrder(["01/02/2026", "2026-02-03", ""], "en-US")).toBe("MDY");
    expect(detectDateOrder(["01/02/2026"], "it-IT")).toBe("DMY");
  });

  it("reads dotted dates day first even in a US browser", () => {
    expect(detectDateOrder(["01.03.2026", "05.03.2026"], "en-US")).toBe("DMY");
  });
});

describe("readStatement options", () => {
  const csv = "Date,Description,Amount\n01/02/2026,Card,12.50\n01/03/2026,Refund,-2.00";

  it("flips signs for exports that write spending as positive", () => {
    const rows = readStatement(csv, undefined, { invert: true }).rows;
    expect(rows.map((r) => r.direction)).toEqual(["DBIT", "CRDT"]);
  });

  it("lets a D/C marker or in/out columns win over the flip", () => {
    const marked = "Date;Description;Amount;D/C\n2026-01-02;Shop;10,00;D\n2026-01-03;Pay;5,00;C";
    expect(readStatement(marked, undefined, { invert: true }).rows.map((r) => r.direction)).toEqual(
      ["DBIT", "CRDT"],
    );
    const split = "Date,Description,Paid out,Paid in\n2026-01-02,Shop,10.00,\n2026-01-03,Pay,,5.00";
    expect(readStatement(split, undefined, { invert: true }).rows.map((r) => r.direction)).toEqual([
      "DBIT",
      "CRDT",
    ]);
  });

  it("uses the date order picked by hand over the guess", () => {
    expect(readStatement(csv).rows[0]!.date).toBe("2026-02-01");
    expect(readStatement(csv, undefined, { dateOrder: "MDY" }).rows[0]!.date).toBe("2026-01-02");
  });

  it("reads a generic D/C marker next to an unsigned amount", () => {
    const marked =
      "Date;Description;Amount;D/C\n2026-01-02;Shop;10,00;D\n2026-01-03;Pay;5,00;C\n2026-01-04;Odd;-1,00;?";
    expect(readStatement(marked).rows.map((r) => [r.direction, r.amount])).toEqual([
      ["DBIT", 10],
      ["CRDT", 5],
      ["DBIT", 1],
    ]);
  });

  it("drops a marker column when there is no single amount column", () => {
    expect(
      guessStatementColumns(["Date", "Description", "Debit", "Credit", "D/C"]).direction,
    ).toBeNull();
  });
});

describe("untrusted values in a file", () => {
  it("#1 skips amounts too large to be real", () => {
    const huge = "9".repeat(308);
    const csv = `Date,Description,Amount\n2026-01-02,Huge,${huge}\n2026-01-03,Big,100000000000000000000\n2026-01-04,Shop,-12.50`;
    const s = readStatement(csv);
    expect(s.rows.map((r) => r.description)).toEqual(["Shop"]);
    expect(s.skipped).toBe(2);
  });

  it("#2 rejects years before 1900 or after next year", () => {
    // polish-3 #19: a fixed "today", so the edge is a literal and New Year can't flake it.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-01T12:00:00Z"));
    try {
      expect(parseDay("0001-01-01")).toBeNull();
      expect(parseDay("1899-12-31")).toBeNull();
      expect(parseDay("9999-12-31")).toBeNull();
      expect(parseDay("2028-01-01")).toBeNull();
      expect(parseDay("1900-01-01")).toBe("1900-01-01");
      expect(parseDay("2027-12-31")).toBe("2027-12-31");
    } finally {
      vi.useRealTimers();
    }
  });

  it("#3 strips control characters and caps descriptions at 500 characters", () => {
    const long = "x".repeat(600);
    const csv = `Date,Description,Amount\n2026-01-02,"a\u0000b\u0007c",-1.00\n2026-01-03,${long},-2.00`;
    const rows = readStatement(csv).rows;
    expect(rows[0]!.description).toBe("abc");
    expect(rows[1]!.description).toHaveLength(500);
  });

  it("polish-3 #15 skips a row whose currency it can't tell instead of calling it EUR", () => {
    const csv =
      "Date,Description,Amount,Currency\n2026-01-02,Diner,-10.00,$\n2026-01-03,Shop,-2.00,EUR\n2026-01-04,Bus,-1.00,";
    const s = readStatement(csv);
    expect(s.rows.map((r) => r.description)).toEqual(["Shop", "Bus"]);
    expect(s.skipped).toBe(1);
  });
});
