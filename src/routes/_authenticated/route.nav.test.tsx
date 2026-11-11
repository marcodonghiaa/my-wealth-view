import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { rows, path } = vi.hoisted(() => ({
  rows: { current: [] as Array<unknown> },
  path: { current: "/" },
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    useRouteContext: () => ({ user: { email: "a@example.com" } }),
  }),
  Link: ({
    children,
    to,
    "aria-current": current,
  }: {
    children: React.ReactNode;
    to: string;
    "aria-current"?: "page";
  }) => (
    <a href={to} aria-current={current}>
      {children}
    </a>
  ),
  Outlet: () => null,
  redirect: vi.fn(),
  useNavigate: () => vi.fn(),
  useRouterState: ({ select }: { select: (s: { location: { pathname: string } }) => string }) =>
    select({ location: { pathname: path.current } }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  loadDemoClient: vi.fn(),
  supabase: {
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }) },
    rpc: () => Promise.resolve({ error: null }),
    from: () => ({ select: () => Promise.resolve({ data: rows.current, error: null }) }),
  },
}));

import { Route, MORE_GROUPS, TAB_BAR_ITEMS } from "./route";

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

describe("phone tabs and More", () => {
  const tabBar = () => screen.getByRole("navigation", { name: "Primary" });

  it("has Net Worth, Activity, Spending, Investing and More", () => {
    rows.current = [];
    path.current = "/";
    renderLayout();
    const labels = [...tabBar().querySelectorAll("a, button")].map((el) => el.textContent);
    expect(labels).toEqual(["Net Worth", "Activity", "Spending", "Investing", "More"]);
  });

  it("lights Investing on both Portfolio and Crypto", () => {
    rows.current = [];
    for (const p of ["/portfolio", "/crypto"]) {
      path.current = p;
      const { unmount } = renderLayout();
      const current = tabBar().querySelector('[aria-current="page"]');
      expect(current?.textContent).toBe("Investing");
      unmount();
    }
  });

  it("marks no tab as current on a page that lives in More", () => {
    rows.current = [];
    path.current = "/accounts";
    renderLayout();
    expect(tabBar().querySelector('[aria-current="page"]')).toBeNull();
  });

  it("lists in More every page without a tab, Import and Rules included, and none twice", () => {
    const tabbed = new Set(TAB_BAR_ITEMS.flatMap((t) => t.owns));
    const more = MORE_GROUPS.flatMap((g) => g.items.map((i) => i.to));
    expect(more).toEqual(
      expect.arrayContaining([
        "/reports",
        "/accounts",
        "/income",
        "/subscriptions",
        "/splitwise",
        "/import",
        "/rules",
      ]),
    );
    expect(more.some((to) => tabbed.has(to))).toBe(false);
    expect(new Set(more).size).toBe(more.length);
  });

  it("drops a group from More when all its pages have a tab", () => {
    expect(MORE_GROUPS.map((g) => g.label)).not.toContain("Investing");
  });

  // protects=the most-used More pages sit under the thumb first; fails_when=sidebar order leaks in
  it("leads More with Accounts, Subscriptions and Who owes you, then Tools apart", () => {
    const [pages, ...rest] = MORE_GROUPS;
    expect(pages!.label).toBe("");
    expect(pages!.items.map((i) => i.label)).toEqual([
      "Accounts",
      "Subscriptions",
      "Who owes you",
      "Reports",
      "Income",
      // Budgets (#139) has no phone tab, so More is where phones reach it.
      "Budgets",
    ]);
    expect(rest.map((g) => g.label)).toEqual(["Tools"]);
  });

  it("titles only the Tools group in the sheet, and ends with Settings and Sign out", () => {
    rows.current = [];
    path.current = "/";
    renderLayout();
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    const sheet = screen.getByRole("navigation", { name: "More" });
    expect([...sheet.querySelectorAll(".ios-section-title")].map((t) => t.textContent)).toEqual([
      "Tools",
    ]);
    const entries = [...sheet.querySelectorAll("a, button")].map((el) => el.textContent);
    expect(entries.slice(-2)).toEqual(["Settings", "Sign out"]);
    expect(sheet).toHaveTextContent("Signed in as a@example.com");
  });
});
