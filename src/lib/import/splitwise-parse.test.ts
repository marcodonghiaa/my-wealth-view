import { describe, expect, it } from "vitest";
import { parseSplitwiseCsv } from "./splitwise-parse";

const HEADER = "Date,Description,Category,Cost,Currency,Ann,Ben,Cy";
const TOTAL = "2026-10-18,Total balance, , ,USD,10.50,-4.25,-6.25";

const file = (...lines: Array<string>) => lines.join("\n");

describe("parseSplitwiseCsv", () => {
  // protects=reading a Splitwise export into exact cents per person; fails_when=a column,
  // amount or the totals row is misread; no_claim=the numbers adding up (checked in a later step)
  it("reads members, rows in cents and the totals row", () => {
    const parsed = parseSplitwiseCsv(
      file(
        HEADER,
        "",
        "2026-08-16,Uber ,Taxi,99.00,USD,74.25,-24.75,-24.75",
        "2026-08-17,Dinner,Dining out,30.10,USD,-10.03,20.07,-10.04",
        "",
        TOTAL,
        "",
      ),
    );

    expect(parsed.members).toEqual(["Ann", "Ben", "Cy"]);
    expect(parsed.rows).toEqual([
      {
        row: 1,
        date: "2026-08-16",
        description: "Uber",
        category: "Taxi",
        costCents: 9900,
        currency: "USD",
        netCents: [7425, -2475, -2475],
      },
      {
        row: 2,
        date: "2026-08-17",
        description: "Dinner",
        category: "Dining out",
        costCents: 3010,
        currency: "USD",
        netCents: [-1003, 2007, -1004],
      },
    ]);
    expect(parsed.total).toEqual({ currency: "USD", netCents: [1050, -425, -625] });
  });

  it("accepts a file with no totals row", () => {
    const parsed = parseSplitwiseCsv(
      file(HEADER, "2026-08-16,Uber,Taxi,9.00,USD,6.00,-3.00,-3.00"),
    );
    expect(parsed.total).toBeNull();
    expect(parsed.rows).toHaveLength(1);
  });

  it("ignores a byte-order mark and keeps members with the same first name apart", () => {
    const parsed = parseSplitwiseCsv(
      file(
        "﻿Date,Description,Category,Cost,Currency,Matteo M,Matteo,Matteo",
        "2026-08-16,x,General,3.00,USD,2.00,-1.00,-1.00",
      ),
    );
    expect(parsed.members).toEqual(["Matteo M", "Matteo", "Matteo"]);
    expect(parsed.rows[0]?.netCents).toEqual([200, -100, -100]);
  });

  it("reads amounts with a decimal comma or without decimals", () => {
    const parsed = parseSplitwiseCsv(file(HEADER, '2026-08-16,x,General,"12,5",USD,8,-4.5,-4'));
    expect(parsed.rows[0]).toMatchObject({ costCents: 1250, netCents: [800, -450, -400] });
  });

  it("reads a Payment row like any other row", () => {
    const parsed = parseSplitwiseCsv(
      file(HEADER, "2026-08-16,Ann paid Ben,Payment,31.69,USD,31.69,-31.69,0.00"),
    );
    expect(parsed.rows[0]).toMatchObject({ category: "Payment", costCents: 3169 });
  });

  it("keeps a negative cost as it is", () => {
    const parsed = parseSplitwiseCsv(
      file(HEADER, "2026-08-16,Refund,General,-9.00,USD,-6.00,3.00,3.00"),
    );
    expect(parsed.rows[0]?.costCents).toBe(-900);
  });

  describe("rejects a file that is not a Splitwise export", () => {
    const bad = (name: string, text: string, message: RegExp) =>
      it(name, () => expect(() => parseSplitwiseCsv(text)).toThrow(message));

    bad(
      "with no member columns",
      file("Date,Description,Category,Cost,Currency", "2026-08-16,x,y,1.00,USD"),
      /member/i,
    );
    bad("with an impossible date", file(HEADER, "2026-02-30,x,y,1.00,USD,1,-1,0"), /row 1.*date/i);
    bad(
      "with a date in another format",
      file(HEADER, "16/08/2026,x,y,1.00,USD,1,-1,0"),
      /row 1.*date/i,
    );
    bad(
      "with a cost that is not a number",
      file(HEADER, "2026-08-16,x,y,abc,USD,1,-1,0"),
      /row 1.*cost/i,
    );
    bad(
      "with a thousands separator",
      file(HEADER, '2026-08-16,x,y,"1,234.50",USD,1,-1,0'),
      /row 1.*cost/i,
    );
    bad(
      "with more than two decimals",
      file(HEADER, "2026-08-16,x,y,1.005,USD,1,-1,0"),
      /row 1.*cost/i,
    );
    bad(
      "with a person amount that is not a number",
      file(HEADER, "2026-08-16,x,y,1.00,USD,1,?,0"),
      /row 1.*Ben/i,
    );
    bad(
      "with a row of the wrong length",
      file(HEADER, "2026-08-16,x,y,1.00,USD,1,-1"),
      /row 1.*columns/i,
    );
    bad(
      "with a cost too large to be real",
      file(HEADER, `2026-08-16,x,y,${"9".repeat(40)},USD,1,-1,0`),
      /row 1.*cost/i,
    );
    bad("with a missing currency", file(HEADER, "2026-08-16,x,y,1.00,,1,-1,0"), /row 1.*currency/i);
    bad(
      "with a totals row that is not last",
      file(HEADER, TOTAL, "2026-08-16,x,y,1.00,USD,1,-1,0"),
      /total/i,
    );
    bad(
      "with two totals rows",
      file(HEADER, "2026-08-16,x,y,1.00,USD,1,-1,0", TOTAL, TOTAL),
      /total/i,
    );
    bad("with only a totals row", file(HEADER, TOTAL), /no expenses/i);
    bad("with no rows", HEADER, /data rows|no expenses/i);
  });

  it("does not echo a huge cell back in an error message", () => {
    const long = "z".repeat(5000);
    let message = "";
    try {
      parseSplitwiseCsv(file(HEADER, `2026-08-16,x,y,${long},USD,1,-1,0`));
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/row 1/i);
    expect(message.length).toBeLessThan(200);
  });
});
