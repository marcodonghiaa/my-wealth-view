import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => Promise.resolve({ data: [], error: null }) }),
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ImportTrades } from "./import-trades";

function open(kind: "stock" | "crypto") {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ImportTrades kind={kind} saved={[]} />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByText("Import trades from CSV"));
}

describe("ImportTrades", () => {
  it("asks where the trades are from before asking for a file", () => {
    open("stock");
    expect(screen.getByText("Where are these trades from?")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Trade Republic/ })).toBeTruthy();
    expect(screen.queryByLabelText("CSV file")).toBeNull();
  });

  it("a broker shows how to export from it, then the file picker, and no text box", () => {
    open("stock");
    fireEvent.click(screen.getByRole("button", { name: /Trade Republic/ }));
    expect(screen.getByText(/In the Trade Republic app/)).toBeTruthy();
    expect(screen.getByLabelText("CSV file")).toBeTruthy();
    expect(screen.queryByLabelText("CSV text")).toBeNull();
  });

  it("a spreadsheet shows the columns and lets you paste", () => {
    open("stock");
    fireEvent.click(screen.getByRole("button", { name: /My own spreadsheet/ }));
    expect(screen.getByText(/date, side, isin, shares, price/)).toBeTruthy();
    expect(screen.getByLabelText("CSV text")).toBeTruthy();
  });

  it("another broker offers to ask for it, or to use a spreadsheet instead", () => {
    open("stock");
    fireEvent.click(screen.getByRole("button", { name: /Another broker/ }));
    expect(screen.getByRole("link", { name: "Ask for your broker" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save trades" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Use a spreadsheet" }));
    expect(screen.getByLabelText("CSV text")).toBeTruthy();
  });

  it("you can go back and choose another source", () => {
    open("stock");
    fireEvent.click(screen.getByRole("button", { name: /Another broker/ }));
    fireEvent.click(screen.getByRole("button", { name: /Choose another source/ }));
    expect(screen.getByText("Where are these trades from?")).toBeTruthy();
  });

  it("the crypto page lists no stock brokers", () => {
    open("crypto");
    expect(screen.queryByRole("button", { name: /Trade Republic/ })).toBeNull();
    expect(screen.getByRole("button", { name: /My own spreadsheet/ })).toBeTruthy();
  });
});
