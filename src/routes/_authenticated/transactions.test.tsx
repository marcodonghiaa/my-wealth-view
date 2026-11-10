import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

let failTable: string | null = null;
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "order", "eq", "neq", "gte", "lt", "lte", "is", "in", "not"]) {
        q[m] = () => q;
      }
      q["then"] = (resolve: (v: unknown) => void) =>
        resolve(
          table === failTable
            ? { data: null, error: { message: "boom" } }
            : { data: [], error: null },
        );
      return q;
    },
  },
}));

import { Route } from "./transactions";

const Page = Route.options.component as () => React.JSX.Element;
const renderPage = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <Page />
    </QueryClientProvider>,
  );

describe("Transactions page when an extra source fails to load", () => {
  // protects=a failed Splitwise or account query is reported, not shown as missing rows or labels;
  // fails_when=the page ignores the error state of its shares, accounts or transfers queries
  it.each(["v_splitwise_eur", "accounts"])("shows an error when %s fails", async (table) => {
    failTable = table;
    renderPage();
    expect((await screen.findByRole("alert")).textContent).toContain("boom");
    failTable = null;
  });

  it("shows no error when everything loads", async () => {
    renderPage();
    await screen.findAllByText(/No transactions for/);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
