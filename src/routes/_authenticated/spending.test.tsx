import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const worthItBounds: Array<[string, string]> = [];
let failTable: string | null = null;
// v_spend_by_category_monthly rows by month ("2026-10-01").
let spendByMonth: Record<string, Array<{ category: string | null; spend_eur: number }>> = {};
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const filters: Record<string, string> = {};
      const q: Record<string, unknown> = {};
      for (const m of ["select", "order", "is"]) q[m] = () => q;
      q["eq"] = (c: string, v: string) => (c === "month" && (filters["month"] = v), q);
      q["gte"] = (_c: string, v: string) => ((filters["gte"] = v), q);
      q["lt"] = (_c: string, v: string) => ((filters["lt"] = v), q);
      q["then"] = (resolve: (v: unknown) => void) => {
        if (table === "v_transactions_eur") {
          worthItBounds.push([filters["gte"] ?? "", filters["lt"] ?? ""]);
        }
        resolve(
          table === failTable
            ? { data: null, error: { message: "boom" } }
            : {
                data:
                  table === "v_spend_by_category_monthly"
                    ? (spendByMonth[filters["month"] ?? ""] ?? [])
                    : [],
                error: null,
              },
        );
      };
      return q;
    },
  },
}));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  Link: ({ children }: { children: React.ReactNode }) => <a href="/transactions">{children}</a>,
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

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Page />
    </QueryClientProvider>,
  );

// protects=the page answers "where did it go, and is that normal?" once per number;
// fails_when=the total or shares repeat, rows are dead ends, or the comparison reads the wrong way
describe("Spending page breakdown", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-11-10T12:00:00"));
  });
  afterEach(() => {
    vi.useRealTimers();
    spendByMonth = {};
  });

  const october = [
    { category: "Housing", spend_eur: 800 },
    { category: null, spend_eur: 200 },
  ];

  it("shows each category once, with its share, and no Total row", async () => {
    spendByMonth = { "2026-11-01": october };
    renderPage();
    const links = await screen.findAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual([
      "Housing80%€800.00",
      "Uncategorized20%€200.00",
    ]);
    expect(screen.queryByText("Total")).toBeNull();
  });

  it("says a finished month cost less than the one before, in the good colour", async () => {
    spendByMonth = {
      "2026-10-01": [{ category: "Housing", spend_eur: 900 }],
      "2026-09-01": [{ category: "Housing", spend_eur: 1000 }],
    };
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Previous month" }));
    const line = await screen.findByText(/less than September/);
    expect(line).toHaveTextContent("€100.00 less than September");
    expect(line).toHaveClass("text-positive");
  });

  it("says a finished month cost more, in the alarm colour", async () => {
    spendByMonth = {
      "2026-10-01": [{ category: "Housing", spend_eur: 1100 }],
      "2026-09-01": [{ category: "Housing", spend_eur: 1000 }],
    };
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Previous month" }));
    expect(await screen.findByText(/more than September/)).toHaveClass("text-negative");
  });

  it("calls a sub-euro move the same", async () => {
    spendByMonth = {
      "2026-10-01": [{ category: "Housing", spend_eur: 1000.4 }],
      "2026-09-01": [{ category: "Housing", spend_eur: 1000 }],
    };
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Previous month" }));
    expect(await screen.findByText("About the same as September")).toHaveClass(
      "text-muted-foreground",
    );
  });

  // The running month gets the same plain line as any other: no "so far" wording.
  it("compares the running month in the same plain words", async () => {
    spendByMonth = {
      "2026-11-01": october,
      "2026-10-01": [{ category: "Housing", spend_eur: 1500 }],
    };
    renderPage();
    const line = await screen.findByText(/less than October$/);
    expect(line).toHaveClass("text-positive");
    expect(screen.queryByText(/so far|already|all of/)).toBeNull();
  });

  it("shows no comparison when last month has no spend", async () => {
    spendByMonth = { "2026-11-01": october };
    renderPage();
    await screen.findAllByRole("link");
    expect(screen.queryByText(/October/)).toBeNull();
  });

  it("offers the previous month when this one is empty", async () => {
    renderPage();
    await screen.findByText("No spending recorded for November 2026.");
    await userEvent.click(screen.getByText("Previous month", { selector: "button" }));
    expect(await screen.findByText("No spending recorded for October 2026.")).toBeInTheDocument();
  });
});
