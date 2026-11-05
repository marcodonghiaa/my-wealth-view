import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const rows = vi.hoisted(() => ({ v_cd_holdings: [] as Array<Record<string, unknown>> }));
vi.mock("@/integrations/supabase/client", () => {
  const query = (table: string) => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "order", "eq"]) q[m] = () => q;
    q["then"] = (resolve: (v: unknown) => void) =>
      resolve({ data: rows[table as keyof typeof rows] ?? [], error: null });
    return q;
  };
  return { supabase: { from: query } };
});
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  Link: ({ children }: { children: React.ReactNode }) => <a href="/import">{children}</a>,
}));

import { Route } from "./accounts";

const Page = Route.options.component as () => React.JSX.Element;

describe("Add certificate of deposit form", () => {
  const originalTz = process.env["TZ"];
  beforeEach(() => {
    // 00:30 on 20 Oct in Dublin (UTC+1): still 19 Oct in UTC.
    process.env["TZ"] = "Europe/Dublin";
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-10-19T23:30:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    if (originalTz === undefined) delete process.env["TZ"];
    else process.env["TZ"] = originalTz;
  });

  it("starts on the user's local day, not the UTC day", async () => {
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <Page />
      </QueryClientProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: /add certificate|add cd|add/i }));
    const start = container.querySelector<HTMLInputElement>('input[type="date"]');
    expect(start?.value).toBe("2026-10-20");
  });

  // Regression: principal and APY had no upper bound, so 1e308 (a valid number
  // input) was saved and the CD's value grew to €∞ and "1e+308% APY".
  async function submitCd(principal: string, apy: string, start?: string) {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Page />
      </QueryClientProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: /add a certificate of deposit/i }));
    fireEvent.change(screen.getByPlaceholderText("e.g. House deposit CD"), {
      target: { value: "Probe CD" },
    });
    fireEvent.change(screen.getByPlaceholderText("10000"), { target: { value: principal } });
    fireEvent.change(screen.getByPlaceholderText("3.5"), { target: { value: apy } });
    const dates = document.querySelectorAll<HTMLInputElement>('input[type="date"]');
    if (start) fireEvent.change(dates[0]!, { target: { value: start } });
    fireEvent.change(dates[1]!, { target: { value: "2099-01-01" } });
    await userEvent.click(screen.getByRole("button", { name: "Add CD" }));
  }

  it("rejects a principal too large to show", async () => {
    await submitCd("1e308", "3.5");
    expect(screen.getByText(/principal must be .* up to/i)).toBeInTheDocument();
  });

  it("rejects an APY above 100%", async () => {
    await submitCd("10000", "1e308");
    expect(screen.getByText(/APY\) must be between 0 and 100%/i)).toBeInTheDocument();
  });

  it("rejects a start date so far back the value can't be shown", async () => {
    await submitCd("1000000000000", "100", "0001-01-01");
    expect(screen.getByText(/too large to show/i)).toBeInTheDocument();
  });

  it("accepts the largest principal and APY", async () => {
    await submitCd("1000000000000", "100");
    expect(screen.queryByText(/must be|too large/i)).not.toBeInTheDocument();
  });
});

describe("CD card", () => {
  afterEach(() => {
    rows.v_cd_holdings = [];
  });

  // Regression: the remove button was 28px, hard to hit with a thumb on a phone.
  it("has a remove button big enough to tap (44px)", async () => {
    rows.v_cd_holdings = [
      {
        id: "cd1",
        label: "12-month deposit",
        bank_label: "Demo Bank",
        currency: "EUR",
        principal: 1000,
        annual_rate: 0.03,
        start_date: "2026-01-01",
        maturity_date: "2027-01-01",
        is_matured: false,
        current_value_native: 1025,
        current_value_eur: 1025,
      },
    ];
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Page />
      </QueryClientProvider>,
    );

    const remove = await screen.findByRole("button", { name: "Remove 12-month deposit" });

    expect(remove).toHaveClass("size-11");
  });
});
