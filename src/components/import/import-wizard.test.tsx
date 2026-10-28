import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const upsert = vi.fn(async (_rows: unknown, _opts?: unknown) => ({ error: null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) },
    from: () => ({ upsert, delete: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }) }),
  },
}));

import { ImportWizard } from "./import-wizard";

beforeEach(() => localStorage.clear());

function setup() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ImportWizard />
    </QueryClientProvider>,
  );
}
const upload = (text: string) =>
  fireEvent.change(document.querySelector("input[type=file]") as HTMLInputElement, {
    target: { files: [new File([text], "h.csv", { type: "text/csv" })] },
  });

describe("ImportWizard", () => {
  // protects=a user can go file -> check -> import; fails_when=columns are not guessed, the
  // preview is wrong or Import does not write; no_claim=the real database
  it("previews a file, then writes the rows on Import", async () => {
    setup();
    upload("Month,Total\n2024-02,100\n2024-03,150\nbad,1\n");
    expect(await screen.findByText(/2 rows ready, 1 skipped/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Import 2 rows/ }));
    await waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/Undo this import/)).toBeTruthy();
  });

  // protects=the check step reads like a table of euros; fails_when=values run together
  // unlabeled, or raw floats show instead of money
  it("previews the rows as a labeled table of euro amounts", async () => {
    setup();
    upload("Month,Stocks,Bonds\n2024-02,0.1,0.2\n");
    expect(await screen.findByRole("columnheader", { name: "Month end" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Liabilities" })).toBeTruthy();
    const cells = screen.getAllByRole("cell").map((c) => c.textContent);
    expect(cells[0]).toBe("2024-02-29");
    expect(cells[1]).toMatch(/0[.,]30/);
    expect(cells.join(" ")).not.toMatch(/0000/);
  });

  it("removes the import when Undo is pressed", async () => {
    setup();
    upload("Month,Total\n2024-02,100\n");
    fireEvent.click(await screen.findByRole("button", { name: /Import 1 rows/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Undo this import/ }));
    await waitFor(() => expect(screen.queryByText(/Undo this import/)).toBeNull());
  });

  // protects=Undo is still there after leaving the page; fails_when=the last import is forgotten
  it("offers Undo again after the page is reopened", async () => {
    const first = setup();
    upload("Month,Total\n2024-02,100\n");
    fireEvent.click(await screen.findByRole("button", { name: /Import 1 rows/ }));
    await screen.findByRole("button", { name: /Undo this import/ });
    first.unmount();
    setup();
    expect(await screen.findByRole("button", { name: /Undo this import/ })).toBeTruthy();
  });

  it("rejects an oversized file without reading it", async () => {
    setup();
    const big = new File(["x"], "big.csv", { type: "text/csv" });
    Object.defineProperty(big, "size", { value: 3_000_000 });
    fireEvent.change(document.querySelector("input[type=file]") as HTMLInputElement, {
      target: { files: [big] },
    });
    expect((await screen.findByRole("alert")).textContent).toMatch(/too large/);
  });

  it("shows a plain message for an empty file", async () => {
    setup();
    upload("   ");
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "The file is empty.");
  });

  // protects=a spending import shows where each file category goes and honors a correction;
  // fails_when=Subscriptions lands in Entertainment unseen, or the pick isn't what gets written
  it("shows the category mapping and imports under the category the user picked", async () => {
    upsert.mockClear();
    setup();
    fireEvent.click(screen.getByRole("radio", { name: "Spending by month" }));
    upload("Month,Category,Amount\n2024-02,Subscriptions,9.99\n");
    const pick = (await screen.findByLabelText("Subscriptions")) as HTMLSelectElement;
    expect(pick.value).toBe("Entertainment");
    fireEvent.change(pick, { target: { value: "Services" } });
    fireEvent.click(await screen.findByRole("button", { name: /Import 1 rows/ }));
    await waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
    expect(upsert.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({ category: "Services", spend_eur: 9.99 }),
    ]);
  });

  it("asks for the required column when none was guessed", async () => {
    setup();
    upload("a,b\n1,2\n");
    expect(await screen.findByText(/Choose a column for: Month/)).toBeTruthy();
  });
});
