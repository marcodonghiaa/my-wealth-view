import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { setLocaleOverride } from "@/lib/locale";
import { TradesDialog } from "./trades-dialog";

afterEach(() => setLocaleOverride(""));

describe("TradesDialog", () => {
  it("polish-3 #6 writes each trade's shares in the chosen format", async () => {
    setLocaleOverride("de-DE");
    render(
      <QueryClientProvider client={new QueryClient()}>
        <TradesDialog
          kind="stock"
          holdingKey="K"
          name="Example ETF"
          quantity={1.5}
          label="Trades"
          trades={[
            {
              id: "t1",
              kind: "stock",
              key: "K",
              side: "buy",
              trade_date: "2026-03-01",
              shares: 1.5,
              price_eur: 10,
              fee_eur: 0,
            },
          ]}
        />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Trades" }));
    expect(await screen.findByText("Bought 1,5")).toBeInTheDocument();
  });

  it("polish-5 #5 fills the edit form in the chosen format", async () => {
    setLocaleOverride("it-IT");
    render(
      <QueryClientProvider client={new QueryClient()}>
        <TradesDialog
          kind="stock"
          holdingKey="K"
          name="Example ETF"
          quantity={0.5}
          label="Trades"
          trades={[
            {
              id: "t1",
              kind: "stock",
              key: "K",
              side: "buy",
              trade_date: "2026-03-01",
              shares: 0.5,
              price_eur: 1234.56,
              fee_eur: 1.5,
            },
          ]}
        />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Trades" }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit trade of 2026-03-01" }));
    expect(screen.getByLabelText(/Shares/)).toHaveValue("0,5");
    expect(screen.getByLabelText(/Price/)).toHaveValue("1234,56");
    expect(screen.getByLabelText(/Fee/)).toHaveValue("1,5");
  });

  it("left-open #1 says why an unclear shares, price or fee like 1,250 is refused", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <TradesDialog
          kind="stock"
          holdingKey="K"
          name="Example ETF"
          quantity={0}
          label="Trades"
          trades={[]}
        />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Trades" }));
    const fill = (shares: string, price: string, fee: string) => {
      fireEvent.change(screen.getByLabelText(/Shares/), { target: { value: shares } });
      fireEvent.change(screen.getByLabelText(/Price/), { target: { value: price } });
      fireEvent.change(screen.getByLabelText(/Fee/), { target: { value: fee } });
      fireEvent.click(screen.getByRole("button", { name: "Add trade" }));
    };
    fill("1,250", "10", "");
    expect(await screen.findByRole("alert")).toHaveTextContent('"1,250" could mean 1250 or 1.25');
    fill("1", "2,500", "");
    expect(screen.getByRole("alert")).toHaveTextContent('"2,500" could mean 2500 or 2.5');
    fill("1", "10", "3,000");
    expect(screen.getByRole("alert")).toHaveTextContent('"3,000" could mean 3000 or 3');
  });
});
