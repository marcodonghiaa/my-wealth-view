import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const SNAPSHOT = {
  snapshot_date: "2026-10-19",
  total_eur: 1000,
  bank_total_eur: 400,
  portfolio_total_eur: 400,
  crypto_total_eur: 200,
};
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "order", "limit", "in"]) q[m] = () => q;
      q["then"] = (resolve: (v: unknown) => void) => {
        // The exchange rates never arrive: the page must say it is waiting, not that there are none.
        if (table === "fx_rates") return;
        resolve({ data: table === "v_net_worth_daily" ? [SNAPSHOT] : [], error: null });
      };
      return q;
    },
  },
}));
vi.mock("recharts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("recharts")>()),
  ResponsiveContainer: () => null,
}));

import { Route } from "./index";

const Page = Route.options.component as () => React.JSX.Element;

describe("Net worth page in a foreign currency", () => {
  it("does not claim a missing exchange rate while rates are still loading", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Page />
      </QueryClientProvider>,
    );
    await userEvent.click(await screen.findByRole("radio", { name: "USD" }));
    expect(screen.queryByText(/No USD exchange rate/)).toBeNull();
  });
});
