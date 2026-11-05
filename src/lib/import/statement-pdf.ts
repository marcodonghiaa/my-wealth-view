// A statement PDF is read by the backend function parse-statement (Gemini). The rows come back in
// the same shape as a CSV's, so the preview, the duplicate check and the import are shared.
import { functionErrorMessage } from "@/lib/function-error";
import type { StatementRow } from "./statement";

// The function's limit is 8 MB of base64, about 6 MB of PDF.
export const MAX_PDF_BYTES = 6_000_000;

type Invoke = (
  name: "parse-statement",
  opts: { body: { pdf: string } },
) => PromiseLike<{ data: { rows?: Array<StatementRow> } | null; error: unknown }>;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000; // String.fromCharCode takes a limited number of arguments
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** The transactions the AI found in the PDF. Throws an Error with a plain-language message. */
export async function readStatementPdf(invoke: Invoke, file: File): Promise<Array<StatementRow>> {
  if (file.size > MAX_PDF_BYTES) {
    throw new Error("The PDF is too large (limit is about 6 MB). Try one month at a time.");
  }
  const pdf = toBase64(new Uint8Array(await file.arrayBuffer()));
  const { data, error } = await invoke("parse-statement", { body: { pdf } });
  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status;
    throw new Error(
      status === 404
        ? "PDF import needs the parse-statement function deployed in the backend."
        : await functionErrorMessage(error, "Couldn't read the PDF, try again."),
    );
  }
  const rows = data?.rows ?? [];
  if (rows.length === 0) throw new Error("No transactions found in this PDF.");
  return rows;
}
