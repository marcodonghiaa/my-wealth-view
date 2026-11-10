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
});
