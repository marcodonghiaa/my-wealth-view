import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { rows } = vi.hoisted(() => ({ rows: { current: [] as Array<unknown> } }));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    useRouteContext: () => ({ user: { email: "a@example.com" } }),
  }),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  Outlet: () => null,
  redirect: vi.fn(),
  useNavigate: () => vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  loadDemoClient: vi.fn(),
  supabase: {
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }) },
    rpc: () => Promise.resolve({ error: null }),
    from: () => ({ select: () => Promise.resolve({ data: rows.current, error: null }) }),
  },
}));

import { Route } from "./route";

const Layout = Route.options.component as () => React.JSX.Element;
const suggested = (id: string) => ({
  id,
  detected_status: "suggested",
  user_status: null,
  cadence: "monthly",
  next_expected: "2099-01-01",
  last_charged: "2098-12-01",
});

const renderLayout = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Layout />
    </QueryClientProvider>,
  );

describe("nav badge", () => {
  it("shows the to-review count on Subscriptions (sidebar and menu)", async () => {
    rows.current = [
      suggested("a"),
      suggested("b"),
      { ...suggested("c"), user_status: "confirmed" },
    ];
    renderLayout();
    const pills = await screen.findAllByText("to review");
    // sidebar, mobile More tab, and menu sheet
    expect(pills.length).toBeGreaterThanOrEqual(2);
    pills.forEach((p) => expect(p.parentElement).toHaveTextContent("2 to review"));
    expect(screen.getByRole("button", { name: "More, 2 to review" })).toBeTruthy();
  });

  it("shows no badge when nothing is to review", async () => {
    rows.current = [{ ...suggested("a"), user_status: "confirmed" }];
    renderLayout();
    await screen.findAllByText("Subscriptions");
    await new Promise((r) => setTimeout(r, 20)); // let the query settle
    expect(screen.queryByText("to review")).toBeNull();
    expect(screen.getByRole("button", { name: "More" })).toBeTruthy();
  });
});

describe("sidebar icons", () => {
  it("puts a line icon beside every sidebar entry, Settings and Sign out included", () => {
    rows.current = [];
    renderLayout();
    const aside = document.querySelector("aside")!;
    for (const label of ["Net Worth", "Accounts", "Crypto", "Settings"]) {
      const link = [...aside.querySelectorAll("a")].find((a) => a.textContent?.includes(label))!;
      expect(link.querySelector("svg")).not.toBeNull();
    }
    const signOut = [...aside.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Sign out"),
    )!;
    expect(signOut.querySelector("svg")).not.toBeNull();
  });
});
