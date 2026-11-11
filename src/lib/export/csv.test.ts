import { describe, expect, it } from "vitest";
import { buildCsvFiles, toCsv } from "./csv";
import { EXPORT_TABLES, type ExportData } from "./tables";

const body = (csv: string) => csv.replace("﻿", "").split("\r\n");

// protects=a spreadsheet never runs exported text as a formula, and numbers survive untouched;
// fails_when=escapeFormulae is dropped or applied to numbers
describe("toCsv", () => {
  it.each(["=SUM(A1)", "+1+1", "-2+3", "@cmd", "\tx", "\rx"])("quotes a leading %j", (text) => {
    const [, line] = body(toCsv(["a"], [{ a: text }]));
    expect(line?.replace(/^"/, "").startsWith("'")).toBe(true);
  });

  it("leaves negative numbers as numbers", () => {
    expect(body(toCsv(["a"], [{ a: -12.5 }]))[1]).toBe("-12.5");
  });

  it("escapes quotes, commas and newlines inside text", () => {
    const csv = toCsv(["a"], [{ a: 'say "hi", ok\nnext' }]);
    expect(csv).toContain('"say ""hi"", ok\nnext"');
  });

  it("writes missing values empty and objects as JSON", () => {
    expect(body(toCsv(["a", "b", "c"], [{ a: null, c: { x: 1 } }]))[1]).toBe(
      '"",,"{""x"":1}"'.replace('"",', ","),
    );
  });

  it("writes tags as a readable list, and an empty list as empty", () => {
    expect(body(toCsv(["tags"], [{ tags: ["trip", "work"] }]))[1]).toBe('"trip, work"');
    expect(body(toCsv(["tags"], [{ tags: [] }]))[1]).toBe("");
  });

  // fails_when=any list of words is joined, so a list in another column can't be told apart
  it("keeps other lists as JSON", () => {
    expect(body(toCsv(["a"], [{ a: ["x", "y"] }]))[1]).toBe('"[""x"",""y""]"');
  });

  it("starts with a byte order mark and the header row", () => {
    const csv = toCsv(["a", "b"], []);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(body(csv)[0]).toBe("a,b");
  });
});

// protects=the export carries the user's notes and tags; fails_when=either column is dropped
describe("buildCsvFiles", () => {
  it("puts note and tags in transactions.csv", () => {
    const d = Object.fromEntries(EXPORT_TABLES.map((t) => [t.name, []])) as unknown as ExportData;
    d.transactions = [
      { entry_reference: "r1", note: "Paid for two", tags: ["trip", "work"], raw: {} },
    ];
    const [head, line] = body(buildCsvFiles(d)["transactions.csv"]!);
    expect(head).toBe("entry_reference,note,tags");
    expect(line).toBe('r1,Paid for two,"trip, work"');
  });
});
