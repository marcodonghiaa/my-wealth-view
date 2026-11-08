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
    expect((await screen.findAllByLabelText("2 to review")).length).toBeGreaterThan(0);
  });

  it("shows no badge when nothing is to review", async () => {
    rows.current = [{ ...suggested("a"), user_status: "confirmed" }];
    renderLayout();
    await screen.findAllByText("Subscriptions");
    await new Promise((r) => setTimeout(r, 20)); // let the query settle
    expect(screen.queryByLabelText(/to review/)).toBeNull();
  });
});
