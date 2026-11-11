import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

let failTable: string | null = null;
// Someone who imported a spreadsheet but has no bank yet: history rows, no live snapshots.
let historyOnly = false;
// Per-test rows for a table, in place of the defaults below.
let rowsFor: Record<string, Array<unknown>> = {};
const HISTORY = {
  snapshot_date: "2025-01-31",
  stocks_eur: 1000,
  bonds_eur: 0,
  crypto_eur: 0,
  cash_eur: 500,
  other_eur: 0,
  liabilities_eur: 0,
  total_eur: 1500,
};
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
        if (table === failTable) return resolve({ data: null, error: { message: "boom" } });
        if (rowsFor[table]) return resolve({ data: rowsFor[table], error: null });
        if (historyOnly)
          return resolve({ data: table === "net_worth_history" ? [HISTORY] : [], error: null });
        resolve({ data: table === "v_net_worth_daily" ? [SNAPSHOT] : [], error: null });
      };
      return q;
    },
  },
}));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  Link: ({ children }: { children: React.ReactNode }) => <a href="/health">{children}</a>,
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

describe("Net worth page when an extra source fails to load", () => {
  // protects=a failed history query is reported instead of silently shortening the chart;
  // fails_when=the page ignores the error state of its history, rebuilt-month or FX queries
  it.each(["net_worth_history", "net_worth_reconstructed"])(
    "shows an error when %s fails",
    async (table) => {
      failTable = table;
      render(
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <Page />
        </QueryClientProvider>,
      );
      expect((await screen.findByRole("alert")).textContent).toContain("boom");
      failTable = null;
    },
  );

  it("shows no error when everything loads", async () => {
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <Page />
      </QueryClientProvider>,
    );
    await screen.findByRole("radio", { name: "USD" });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  // Health lives in Settings now; the dashboard no longer links to it.
  it("has no Health shortcut", async () => {
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <Page />
      </QueryClientProvider>,
    );
    await screen.findByRole("radio", { name: "USD" });
    expect(screen.queryByRole("link", { name: /health/i })).toBeNull();
  });
});

describe("Net worth page with only imported history", () => {
  // protects=a new user who imported a CSV sees their history charted; fails_when=the empty
  // chart message keys on live snapshots instead of on what the chart would draw
  it("charts the history instead of saying there is no data", async () => {
    historyOnly = true;
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <Page />
      </QueryClientProvider>,
    );
    await screen.findByRole("radio", { name: "USD" });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText("No data to chart yet.")).toBeNull();
    historyOnly = false;
  });
});

const renderPage = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <Page />
    </QueryClientProvider>,
  );
const day = (snapshot_date: string, total_eur: number) => ({
  ...SNAPSHOT,
  snapshot_date,
  total_eur,
});

describe("Net worth page: today", () => {
  // protects=Today reads like the range line: amount, (percent), label, coloured by sign;
  // fails_when=Today shows only a percent, or a Month figure comes back
  it("shows today's move as amount and percent, red when down, with no Month", async () => {
    rowsFor = {
      v_net_worth_daily: [
        day("2026-10-31", 1000),
        day("2026-11-09", 1250),
        day("2026-11-10", 1000),
      ],
    };
    renderPage();
    const label = await screen.findByText("Today");
    const line = label.parentElement!;
    expect(line.textContent).toBe("−€250 (−20.00%)Today");
    expect(line.firstElementChild!.className).toContain("text-negative");
    expect(screen.queryByText("Month")).toBeNull();
    rowsFor = {};
  });

  it("is green and signed + when up", async () => {
    rowsFor = { v_net_worth_daily: [day("2026-11-09", 1000), day("2026-11-10", 1250)] };
    renderPage();
    const line = (await screen.findByText("Today")).parentElement!;
    expect(line.textContent).toBe("+€250 (+25.00%)Today");
    expect(line.firstElementChild!.className).toContain("text-positive");
    rowsFor = {};
  });
});

describe("Net worth page: sync freshness", () => {
  const bank = (snapshot_date: string) => ({
    uid: "u1",
    label: "Bank EUR",
    currency: "EUR",
    bank_name: "Bank",
    consent_valid_until: "2999-01-01",
    snapshot_date,
  });

  // protects=the user sees how fresh the figure is; fails_when=the line is missing or links when healthy
  it("says when the banks last synced, as plain text when all is well", async () => {
    rowsFor = { v_bank_accounts_latest: [bank(new Date().toISOString().slice(0, 10))] };
    renderPage();
    expect(await screen.findByText("Synced today")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /attention/ })).toBeNull();
    rowsFor = {};
  });

  it("links to the health checks when one fails", async () => {
    rowsFor = { v_bank_accounts_latest: [bank("2020-01-01")] };
    renderPage();
    expect(
      await screen.findByRole("link", { name: /1 check needs attention/ }),
    ).toBeInTheDocument();
    rowsFor = {};
  });

  it("says nothing without a connected bank", async () => {
    renderPage();
    await screen.findByRole("radio", { name: "USD" });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText(/Synced/)).toBeNull();
  });
});
