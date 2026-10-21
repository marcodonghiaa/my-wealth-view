import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const subscriptions = [
  { monthly_equivalent_eur: -10, charge_count: 3, billing_frequency_is_manual: false },
  { monthly_equivalent_eur: -5, charge_count: 2, billing_frequency_is_manual: false },
  { monthly_equivalent_eur: -4, charge_count: 1, billing_frequency_is_manual: true },
  { monthly_equivalent_eur: -1000, charge_count: 1, billing_frequency_is_manual: false },
];

let failTable: string | null = null;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "order", "eq", "gte", "lt", "lte", "is", "in", "not"])
        q[m] = () => q;
      q["maybeSingle"] = () => q;
      q["then"] = (resolve: (v: unknown) => void) =>
        resolve(
          table === failTable
            ? { data: null, error: { message: "boom" } }
            : { data: table === "v_subscriptions" ? subscriptions : [], error: null },
        );
      return q;
    },
  },
}));
vi.mock("recharts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("recharts")>()),
  ResponsiveContainer: () => null,
}));

import { Route } from "./reports";

const Page = Route.options.component as () => React.JSX.Element;

describe("Reports subscriptions total", () => {
  // protects=Reports shows the same monthly subscription figure as the Subscriptions page;
  // fails_when=one-off single charges are added to the monthly total
  it("counts only recurring subscriptions", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Page />
      </QueryClientProvider>,
    );
    const card = (await screen.findByText("Subscriptions")).closest("section") as HTMLElement;
    expect(await within(card).findByText("€19.00")).toBeTruthy();
  });
});

describe("Reports when a figure fails to load", () => {
  // protects=a failed query shows an error instead of a quiet zero;
  // fails_when=the page ignores the error state of its queries
  it("tells the user some figures could not load", async () => {
    failTable = "v_subscriptions";
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <Page />
      </QueryClientProvider>,
    );
    expect((await screen.findByRole("alert")).textContent).toContain("boom");
    failTable = null;
  });

  it("shows no error when everything loads", async () => {
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <Page />
      </QueryClientProvider>,
    );
    const card = (await screen.findByText("Subscriptions")).closest("section") as HTMLElement;
    await within(card).findByText("€19.00");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
