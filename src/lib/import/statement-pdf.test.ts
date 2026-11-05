import { describe, expect, it, vi } from "vitest";
import { MAX_PDF_BYTES, readStatementPdf } from "./statement-pdf";

const pdfFile = (bytes = "%PDF-1.4 test") =>
  new File([bytes], "Fineco.pdf", { type: "application/pdf" });
const row = { date: "2026-04-25", description: "Coffee", amount: 2.5, direction: "DBIT" as const };

describe("readStatementPdf", () => {
  it("sends the PDF as base64 and returns the rows", async () => {
    const invoke = vi.fn(async () => ({ data: { rows: [row] }, error: null }));
    expect(await readStatementPdf(invoke, pdfFile())).toEqual([row]);
    expect(invoke).toHaveBeenCalledWith("parse-statement", {
      body: { pdf: btoa("%PDF-1.4 test") },
    });
  });

  it("refuses a PDF over the limit before sending it", async () => {
    const invoke = vi.fn();
    const big = new File([new Uint8Array(MAX_PDF_BYTES + 1)], "big.pdf");
    await expect(readStatementPdf(invoke, big)).rejects.toThrow(/too large/);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("says the function is missing when it isn't deployed", async () => {
    const invoke = vi.fn(async () => ({
      data: null,
      error: { context: new Response("", { status: 404 }) },
    }));
    await expect(readStatementPdf(invoke, pdfFile())).rejects.toThrow(/deployed/);
  });

  it("passes on the function's own reason", async () => {
    const invoke = vi.fn(async () => ({
      data: null,
      error: {
        context: new Response(
          JSON.stringify({ error: "PDF import needs the GEMINI_API_KEY secret" }),
          { status: 503 },
        ),
      },
    }));
    await expect(readStatementPdf(invoke, pdfFile())).rejects.toThrow(/GEMINI_API_KEY/);
  });

  it("says so when the AI found nothing", async () => {
    const invoke = vi.fn(async () => ({ data: { rows: [] }, error: null }));
    await expect(readStatementPdf(invoke, pdfFile())).rejects.toThrow(/No transactions/);
  });
});
