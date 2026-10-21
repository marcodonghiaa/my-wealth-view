import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const worthItBounds: Array<[string, string]> = [];
let failTable: string | null = null;
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const filters: Record<string, string> = {};
      const q: Record<string, unknown> = {};
      for (const m of ["select", "order", "is"]) q[m] = () => q;
      q["eq"] = () => q;
      q["gte"] = (_c: string, v: string) => ((filters["gte"] = v), q);
      q["lt"] = (_c: string, v: string) => ((filters["lt"] = v), q);
      q["then"] = (resolve: (v: unknown) => void) => {
        if (table === "v_transactions_eur") {
          worthItBounds.push([filters["gte"] ?? "", filters["lt"] ?? ""]);
        }
        resolve(
          table === failTable
            ? { data: null, error: { message: "boom" } }
            : { data: [], error: null },
        );
      };
      return q;
    },
  },
}));
vi.mock("recharts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("recharts")>()),
  ResponsiveContainer: () => null,
}));

import { Route } from "./spending";

const Page = Route.options.component as () => React.JSX.Element;

describe("Spending page 'not worth it' section", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-10-20T12:00:00"));
  });
  afterEach(() => vi.useRealTimers());

  // protects=October's page never shows August's regretted purchases;
  // fails_when=the not-worth-it query is not limited to the selected month
  it("only asks for the selected month", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Page />
      </QueryClientProvider>,
    );
    await screen.findByText(/No spending recorded/);
    expect(worthItBounds).toContainEqual(["2026-10-01", "2026-11-01"]);
  });
});

describe("Spending page when the 'not worth it' answers fail to load", () => {
  // protects=a failed check-in query is reported, not mistaken for "nothing regretted";
  // fails_when=the page ignores the error state of that query
  it("shows an error", async () => {
    failTable = "v_transactions_eur";
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
});
