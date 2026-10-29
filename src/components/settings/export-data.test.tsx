import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchAllTables = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: "u1" } } } }) } },
}));
vi.mock("@/lib/export/fetch-all", async (orig) => ({
  ...(await orig<typeof import("@/lib/export/fetch-all")>()),
  fetchAllTables: (...a: Array<unknown>) => fetchAllTables(...a),
}));

import { ExportError } from "@/lib/export/fetch-all";
import { EXPORT_TABLES } from "@/lib/export/tables";
import { ExportData } from "./export-data";

const emptyTables = () => Object.fromEntries(EXPORT_TABLES.map((t) => [t.name, []]));

// protects=one click downloads one dated zip and a failure never hands over a partial file;
// fails_when=the download fires on error, or progress/error text is lost
describe("ExportData", () => {
  const click = vi.fn();
  beforeEach(() => {
    fetchAllTables.mockReset();
    click.mockReset();
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      click(this.download);
    });
  });

  it("downloads a dated zip and says so", async () => {
    fetchAllTables.mockImplementation(async (_c, _id, onProgress) => {
      onProgress("transactions", 5, 10);
      return emptyTables();
    });
    render(<ExportData />);
    fireEvent.click(screen.getByRole("button", { name: /Download my data/ }));
    expect(await screen.findByText("Downloaded.")).toBeInTheDocument();
    expect(click).toHaveBeenCalledTimes(1);
    expect(click.mock.calls[0]![0]).toMatch(/^myfinances-export-\d{4}-\d{2}-\d{2}\.zip$/);
    expect(fetchAllTables).toHaveBeenCalledWith(expect.anything(), "u1", expect.any(Function));
  });

  it("names the failing table and downloads nothing", async () => {
    fetchAllTables.mockRejectedValue(new ExportError("splitwise_expenses", "permission denied"));
    render(<ExportData />);
    fireEvent.click(screen.getByRole("button", { name: /Download my data/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't read splitwise expenses: permission denied. Nothing was downloaded.",
    );
    expect(click).not.toHaveBeenCalled();
  });
});
