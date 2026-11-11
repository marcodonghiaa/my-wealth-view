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
    delimitersToGuess: [",", ";", "\t", "|"],
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

/**
 * A file's bytes as text. Most exports are UTF-8; older bank and Excel exports in Europe are
 * Windows-1252, where "é" or "€" are single bytes that are not valid UTF-8. Excel's "Unicode
 * text" is UTF-16.
 */
export function decodeCsv(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  // Excel's "Unicode text" is UTF-16 and starts with a byte-order mark.
  if (view[0] === 0xff && view[1] === 0xfe) return new TextDecoder("utf-16le").decode(view);
  if (view[0] === 0xfe && view[1] === 0xff) return new TextDecoder("utf-16be").decode(view);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}
