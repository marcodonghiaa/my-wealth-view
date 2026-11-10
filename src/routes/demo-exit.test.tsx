import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Regression: "Sign out" in the demo landed on /auth, which saw a real login stored in the same
// browser and opened that account's dashboard. Leaving the demo must stop at the sign-in form.

const { navigate, signOut, getSession, routeContext } = vi.hoisted(() => ({
  navigate: vi.fn(() => Promise.resolve()),
  signOut: vi.fn(() => Promise.resolve({ error: null })),
  getSession: vi.fn(() =>
    Promise.resolve({ data: { session: { user: { email: "real@example.com" } } } }),
  ),
  routeContext: { current: {} as Record<string, unknown> },
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    useRouteContext: () => routeContext.current,
    useSearch: () => ({}),
  }),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  Outlet: () => null,
  redirect: vi.fn(),
  useNavigate: () => navigate,
}));
vi.mock("@/integrations/supabase/client", () => ({
  loadDemoClient: vi.fn(),
  openedFromRecoveryLink: () => false,
  supabase: {
    auth: {
      signOut,
      getSession,
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    rpc: () => Promise.resolve({ error: null }),
    from: () => ({ select: () => Promise.resolve({ data: [], error: null }) }),
  },
}));

import { Route as LayoutRoute } from "./_authenticated/route";
import { Route as AuthRoute } from "./auth";
import { enterDemoMode, exitDemoMode } from "@/lib/demo/mode";

const Layout = LayoutRoute.options.component as () => React.JSX.Element;
const AuthPage = AuthRoute.options.component as () => React.JSX.Element;
const authBeforeLoad = AuthRoute.options.beforeLoad as (a: unknown) => { leftDemo: boolean };

const withQuery = (ui: React.ReactNode) =>
  render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

beforeEach(() => {
  navigate.mockClear();
  signOut.mockClear();
  getSession.mockClear();
});
afterEach(() => exitDemoMode());

describe("leaving the demo", () => {
  it("the demo shows Exit demo, which goes to sign-in without a sign-out", async () => {
    enterDemoMode();
    routeContext.current = { user: { email: "demo@example.com" } };
    withQuery(<Layout />);
    const buttons = screen.getAllByRole("button", { name: "Exit demo" });
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
    fireEvent.click(buttons[0]!);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/auth", replace: true }));
    expect(signOut).not.toHaveBeenCalled();
  });

  it("a real session still signs out with Sign out", async () => {
    routeContext.current = { user: { email: "real@example.com" } };
    withQuery(<Layout />);
    fireEvent.click(screen.getAllByRole("button", { name: "Sign out" })[0]!);
    await waitFor(() => expect(signOut).toHaveBeenCalled());
  });

  it("the sign-in page knows when the visitor came from the demo", () => {
    const context = { queryClient: new QueryClient() };
    enterDemoMode();
    expect(authBeforeLoad({ context }).leftDemo).toBe(true);
    expect(authBeforeLoad({ context }).leftDemo).toBe(false);
  });

  it("after the demo, a stored login does not open the dashboard", async () => {
    routeContext.current = { leftDemo: true };
    render(<AuthPage />);
    await screen.findByLabelText(/email/i);
    expect(getSession).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("otherwise a stored login goes straight to the dashboard", async () => {
    routeContext.current = { leftDemo: false };
    render(<AuthPage />);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/", replace: true }));
  });
});
