import { createFileRoute, Outlet, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  TrendingUp,
  Landmark,
  Receipt,
  Repeat,
  PieChart,
  Briefcase,
  Bitcoin,
  LogOut,
  MoreHorizontal,
  FileText,
  ArrowDownLeft,
  Users,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { loadDemoClient, supabase } from "@/integrations/supabase/client";
import { isDemoMode } from "@/lib/demo/mode";
import { registerDashboardOrigin } from "@/lib/register-origin";
import { MadeWith } from "@/components/made-with";
import { BrandMark } from "@/components/brand-mark";
import { TrustNote } from "@/components/trust-note";
import { DemoBadge } from "@/components/demo-badge";
import { NavBadge } from "@/components/nav-badge";
import { groupStreams, romeToday } from "@/lib/recurring";
import { useRecurringStreams } from "@/lib/use-recurring-streams";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // A reloaded demo tab needs the fake client (its own chunk) before anything asks for data.
    if (isDemoMode()) await loadDemoClient();
    try {
      // getSession reads the stored login with no network call; getUser asked Supabase's server
      // on every page change. The database still enforces access, so this only picks the screen.
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) {
        throw redirect({ to: "/auth" });
      }
      return { user: data.session.user };
    } catch (err) {
      if (err instanceof Response) throw err;
      throw redirect({ to: "/auth" });
    }
  },
  component: AuthenticatedLayout,
});

interface NavItem {
  label: string;
  icon: LucideIcon;
  to: string;
}

interface NavGroup {
  label: string;
  items: Array<NavItem>;
}

const NAV_GROUPS: Array<NavGroup> = [
  {
    label: "Overview",
    items: [
      { label: "Net Worth", icon: TrendingUp, to: "/" },
      { label: "Reports", icon: FileText, to: "/reports" },
    ],
  },
  {
    label: "Banking",
    items: [
      { label: "Accounts", icon: Landmark, to: "/accounts" },
      { label: "Transactions", icon: Receipt, to: "/transactions" },
      { label: "Income", icon: ArrowDownLeft, to: "/income" },
      { label: "Spending", icon: PieChart, to: "/spending" },
      { label: "Subscriptions", icon: Repeat, to: "/subscriptions" },
      { label: "Who owes you", icon: Users, to: "/splitwise" },
    ],
  },
  {
    label: "Investing",
    items: [
      { label: "Portfolio", icon: Briefcase, to: "/portfolio" },
      { label: "Crypto", icon: Bitcoin, to: "/crypto" },
    ],
  },
];

// iOS HIG: bottom tabs max 5, icon + label, current tab visually distinct.
// The 5th slot opens the full nav (Sheet) rather than a 6th route.
const TAB_BAR_ITEMS: Array<{ label: string; icon: LucideIcon; to: string }> = [
  { label: "Net Worth", icon: TrendingUp, to: "/" },
  { label: "Transactions", icon: Receipt, to: "/transactions" },
  { label: "Spending", icon: PieChart, to: "/spending" },
  { label: "Portfolio", icon: Briefcase, to: "/portfolio" },
];

// Desktop sidebar: text-only rows; the active one carries a 2px Ember rule on the left.
// Both states keep the same border width so text never shifts.
const SIDEBAR_LINK =
  "flex items-center gap-3 border-l-2 border-transparent px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground";
const SIDEBAR_LINK_ACTIVE =
  "flex items-center gap-3 border-l-2 border-ember px-3 py-1.5 text-sm font-medium text-foreground";

// Mobile tab bar: icon + sans label; the active tab carries a 2px Ember rule on top.
const TAB_LINK =
  "flex flex-col items-center justify-center gap-0.5 border-t-2 border-transparent text-muted-foreground transition-opacity active:opacity-60";
const TAB_LINK_ACTIVE =
  "flex flex-col items-center justify-center gap-0.5 border-t-2 border-ember text-foreground transition-opacity active:opacity-60";
const TAB_LABEL = "text-[0.6875rem] font-medium";

function AuthenticatedLayout() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const streams = useRecurringStreams().data;
  const badges: Record<string, number> = {
    Subscriptions: streams ? groupStreams(streams, romeToday()).toReview.length : 0,
  };

  // Once per page load: tells the backend this address is the dashboard (setup no longer asks for it).
  useEffect(() => {
    void registerDashboardOrigin(() => supabase.rpc("register_dashboard_origin"));
  }, []);

  // Keep route data in sync with auth transitions (e.g. token expiry).
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        void navigate({ to: "/auth", replace: true });
      }
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  async function handleSignOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    await navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-dvh bg-background">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-sidebar md:flex">
        <div className="flex h-16 items-center gap-2.5 px-5">
          <BrandMark className="size-8" />
          <span className="text-[0.9375rem] font-semibold tracking-tight text-sidebar-foreground">
            Alopex
          </span>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-3">
          {NAV_GROUPS.map((group, i) => (
            <div key={group.label}>
              <div className="eyebrow px-3 pb-2">
                {String(i + 1).padStart(2, "0")} {group.label}
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <Link
                    key={item.label}
                    to={item.to}
                    activeOptions={{ exact: true }}
                    className={SIDEBAR_LINK}
                    activeProps={{ className: SIDEBAR_LINK_ACTIVE }}
                  >
                    {item.label}
                    <NavBadge count={badges[item.label]} />
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t p-3">
          <div className="mb-2 truncate px-3 text-xs text-muted-foreground">{user.email}</div>
          <Link
            to="/settings"
            className={SIDEBAR_LINK}
            activeProps={{ className: SIDEBAR_LINK_ACTIVE }}
          >
            Settings
          </Link>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className={`${SIDEBAR_LINK} w-full disabled:opacity-50`}
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
          <MadeWith className="mt-2 px-3" />
        </div>
      </aside>

      {/* Mobile top bar: padded for the notch (safe-area-inset-top is 0 in a normal tab).
          Page titles are large titles inside each page; this bar only names the app. */}
      <div className="glass fixed inset-x-0 top-0 z-30 flex h-[calc(2.75rem+env(safe-area-inset-top))] items-center justify-center border-b pt-[env(safe-area-inset-top)] md:hidden">
        <BrandMark className="mr-2 size-5" />
        <span className="font-sans text-[0.9375rem] font-semibold text-foreground">Alopex</span>
      </div>

      {/* Mobile bottom tab bar: max 5 items, icon + label, current tab marked by an Ember top rule. */}
      <nav
        aria-label="Primary"
        className="glass fixed inset-x-0 bottom-0 z-30 grid h-[calc(3.25rem+env(safe-area-inset-bottom))] grid-cols-5 border-t pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {TAB_BAR_ITEMS.map((item) => (
          <Link
            key={item.label}
            to={item.to}
            activeOptions={{ exact: true }}
            className={TAB_LINK}
            activeProps={{ className: TAB_LINK_ACTIVE }}
          >
            <item.icon className="size-6" />
            <span className={TAB_LABEL}>{item.label}</span>
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-haspopup="dialog"
          aria-label={
            badges["Subscriptions"] ? `More, ${badges["Subscriptions"]} to review` : "More"
          }
          className={TAB_LINK}
        >
          <span className="relative">
            <MoreHorizontal className="size-6" />
            <span aria-hidden="true" className="absolute -top-1 left-full flex">
              <NavBadge count={badges["Subscriptions"]} />
            </span>
          </span>
          <span className={TAB_LABEL}>More</span>
        </button>
      </nav>

      {/* More: bottom sheet with the full nav as grouped lists. */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent
          side="bottom"
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="max-h-[88dvh] gap-0 overflow-y-auto rounded-t-3xl border-0 bg-background p-0 pb-[env(safe-area-inset-bottom)] [&>button]:size-11"
        >
          <div aria-hidden className="mx-auto mt-2 h-1 w-9 rounded-md bg-muted-foreground/40" />
          <SheetHeader className="px-5 pt-3 pb-2 text-left">
            <SheetTitle className="ios-large-title !text-2xl">Menu</SheetTitle>
          </SheetHeader>

          <nav className="space-y-5 px-4 pt-2 pb-3">
            {NAV_GROUPS.map((group) => (
              <div key={group.label}>
                <div className="ios-section-title">{group.label}</div>
                <div className="divide-y overflow-hidden rounded-2xl bg-card">
                  {group.items.map((item) => (
                    <Link
                      key={item.label}
                      to={item.to}
                      activeOptions={{ exact: true }}
                      onClick={() => setMenuOpen(false)}
                      className="flex min-h-11 items-center gap-3 px-4 py-2.5 text-[0.9375rem] text-foreground active:bg-accent"
                      activeProps={{
                        className:
                          "flex min-h-11 items-center gap-3 px-4 py-2.5 text-[0.9375rem] font-medium text-primary active:bg-accent",
                      }}
                    >
                      <item.icon className="size-5 shrink-0" />
                      {item.label}
                      <NavBadge count={badges[item.label]} />
                    </Link>
                  ))}
                </div>
              </div>
            ))}

            <div>
              <div className="ios-section-title">Account</div>
              <div className="divide-y overflow-hidden rounded-2xl bg-card">
                <div className="truncate px-4 py-3 text-sm text-muted-foreground">{user.email}</div>
                <Link
                  to="/settings"
                  onClick={() => setMenuOpen(false)}
                  className="flex min-h-11 items-center gap-3 px-4 py-2.5 text-[0.9375rem] text-foreground active:bg-accent"
                  activeProps={{
                    className:
                      "flex min-h-11 items-center gap-3 px-4 py-2.5 text-[0.9375rem] font-medium text-primary active:bg-accent",
                  }}
                >
                  <Settings className="size-5 shrink-0" />
                  Settings
                </Link>
                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-[0.9375rem] text-negative active:bg-accent disabled:opacity-50"
                >
                  <LogOut className="size-5" />
                  {signingOut ? "Signing out…" : "Sign out"}
                </button>
              </div>
              <MadeWith className="min-h-11 px-4" />
            </div>
          </nav>
        </SheetContent>
      </Sheet>

      <DemoBadge />

      {/* Main content */}
      <main className="min-w-0 flex-1 pt-[calc(2.75rem+env(safe-area-inset-top))] pb-[calc(3.25rem+env(safe-area-inset-bottom))] md:pt-0 md:pb-0 md:pl-64">
        <Outlet />
        <footer className="mx-auto max-w-5xl px-4 pb-8 sm:px-8 md:pb-12">
          <TrustNote className="border-t pt-4" />
        </footer>
      </main>
    </div>
  );
}
