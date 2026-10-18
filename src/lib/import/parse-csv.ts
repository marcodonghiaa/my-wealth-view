import Papa from "papaparse";

// A real personal-finance history is a few hundred rows; these only stop a wrong file (a
// database dump, a photo renamed .csv) from freezing the browser tab.
export const MAX_ROWS = 5000;
export const MAX_CHARS = 2_000_000;

export interface ParsedCsv {
  headers: Array<string>;
  rows: Array<Array<string>>;
}

/** Reads CSV text in the browser. Throws an Error with a plain-language message on a bad file. */
export function parseCsv(text: string): ParsedCsv {
  if (text.length > MAX_CHARS) {
    throw new Error("The file is too large (limit is 2 MB). Is it the right file?");
  }
  const clean = text.replace(/^\uFEFF/, "");
  if (clean.trim() === "") throw new Error("The file is empty.");

  const result = Papa.parse<Array<string>>(clean, {
    delimitersToGuess: [",", ";", "\t"],
    skipEmptyLines: "greedy",
  });

  const brokenQuote = result.errors.find((e) => e.type === "Quotes");
  if (brokenQuote) {
    throw new Error(`The file has a broken quote near line ${(brokenQuote.row ?? 0) + 1}.`);
  }

  const [headerRow, ...body] = result.data;
  if (!headerRow || body.length === 0) throw new Error("The file has no data rows, only a header.");
  if (body.length > MAX_ROWS) {
    throw new Error(`The file has too many rows (limit is ${MAX_ROWS}).`);
  }

  return {
    headers: headerRow.map((h) => h.trim()),
    rows: body.map((row) => row.map((cell) => cell.trim())),
  };
}
