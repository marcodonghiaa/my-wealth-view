import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const subscriptions = [
  {
    monthly_equivalent_eur: -10,
    charge_count: 3,
    billing_frequency_is_manual: false,
    billing_frequency: "Monthly",
  },
  {
    monthly_equivalent_eur: -5,
    charge_count: 2,
    billing_frequency_is_manual: false,
    billing_frequency: "Monthly",
  },
  {
    monthly_equivalent_eur: -4,
    charge_count: 1,
    billing_frequency_is_manual: true,
    billing_frequency: "Monthly",
  },
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
            : {
                // maybeSingle() gives null when the month has no row.
                data:
                  table === "v_subscriptions"
                    ? subscriptions
                    : table === "v_income_vs_expenses_monthly"
                      ? null
                      : [],
                error: null,
              },
        );
      return q;
    },
  },
}));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  Link: ({
    children,
    to,
    search,
    className,
  }: {
    children: React.ReactNode;
    to: string;
    search?: Record<string, string>;
    className?: string;
  }) => (
    <a href={search ? `${to}?${new URLSearchParams(search)}` : to} className={className}>
      {children}
    </a>
  ),
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

  // Regression: a month with nothing recorded showed "+€0.00", as if income matched spending.
  it("shows a dash, not +€0.00, for a month with no income or expense data", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Page />
      </QueryClientProvider>,
    );
    const card = (await screen.findByText("Income minus spending")).closest("li")!;
    await waitFor(() => expect(card).toHaveTextContent("—"));
    expect(card).not.toHaveTextContent("€0.00");
  });
});

// protects=every Reports row opens the page behind its figure (#7);
// fails_when=a headline or the Subscriptions row stops being a link
describe("Reports rows lead to their pages", () => {
  it("links the headlines and Subscriptions, with plain sublabels", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Page />
      </QueryClientProvider>,
    );
    const href = (text: string) =>
      screen.getByText(text).closest("a")?.getAttribute("href") ?? null;
    await screen.findByText("Income minus spending");
    expect(href("Net worth")).toBe("/");
    expect(href("Income minus spending")).toBe("/cash-flow");
    expect(href("Not worth it")).toBe("/spending");
    expect(href("Subscriptions")).toBe("/subscriptions");
    expect(screen.queryByText("Income vs expenses")).toBeNull();
    expect(await screen.findByText("0 of 0 rated purchases")).toBeTruthy();
  });

  it("names the month as the page heading", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Page />
      </QueryClientProvider>,
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/^Report for \w+ \d{4}$/);
  });
});
