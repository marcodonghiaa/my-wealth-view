import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

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

  it("starts with a byte order mark and the header row", () => {
    const csv = toCsv(["a", "b"], []);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(body(csv)[0]).toBe("a,b");
  });
});
