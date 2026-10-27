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
  type LucideIcon,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { PushSubscribeButton } from "@/components/push-subscribe";
import { MadeWith } from "@/components/made-with";
import { BrandMark } from "@/components/brand-mark";
import { DemoBadge } from "@/components/demo-badge";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
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
      { label: "Splitwise", icon: Users, to: "/splitwise" },
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

function AuthenticatedLayout() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

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
      <aside className="glass fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r md:flex">
        <div className="flex h-14 items-center gap-2.5 px-5">
          <BrandMark className="size-8" />
          <span className="text-sm font-semibold tracking-tight text-sidebar-foreground">
            MyFinances
          </span>
        </div>

        <nav className="flex-1 space-y-4 px-3 py-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="px-3 pb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {group.label}
              </div>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <Link
                    key={item.label}
                    to={item.to}
                    activeOptions={{ exact: true }}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 text-[0.9375rem] text-foreground/80 transition-colors hover:bg-accent hover:text-foreground"
                    activeProps={{
                      className:
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-[0.9375rem] font-medium bg-sidebar-accent text-sidebar-primary",
                    }}
                  >
                    <item.icon className="size-4" />
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t p-3">
          <div className="mb-2 truncate px-3 text-xs text-muted-foreground">{user.email}</div>
          <PushSubscribeButton />
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground disabled:opacity-50"
          >
            <LogOut className="size-4" />
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
          <MadeWith className="mt-2 px-3" />
        </div>
      </aside>

      {/* Mobile top bar: padded for the notch (safe-area-inset-top is 0 in a normal tab).
          Page titles are large titles inside each page; this bar only names the app. */}
      <div className="glass fixed inset-x-0 top-0 z-30 flex h-[calc(2.75rem+env(safe-area-inset-top))] items-center justify-center border-b pt-[env(safe-area-inset-top)] md:hidden">
        <span className="text-[0.9375rem] font-semibold text-foreground">MyFinances</span>
      </div>

      {/* Mobile bottom tab bar: max 5 items, icon + label, current tab in the tint colour. */}
      <nav
        aria-label="Primary"
        className="glass fixed inset-x-0 bottom-0 z-30 grid h-[calc(3.25rem+env(safe-area-inset-bottom))] grid-cols-5 border-t pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {TAB_BAR_ITEMS.map((item) => (
          <Link
            key={item.label}
            to={item.to}
            activeOptions={{ exact: true }}
            className="flex flex-col items-center justify-center gap-0.5 text-muted-foreground transition-opacity active:opacity-60"
            activeProps={{
              className:
                "flex flex-col items-center justify-center gap-0.5 text-primary transition-opacity active:opacity-60",
            }}
          >
            <item.icon className="size-6" />
            <span className="text-[0.6875rem] font-medium">{item.label}</span>
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-haspopup="dialog"
          className="flex flex-col items-center justify-center gap-0.5 text-muted-foreground transition-opacity active:opacity-60"
        >
          <MoreHorizontal className="size-6" />
          <span className="text-[0.6875rem] font-medium">More</span>
        </button>
      </nav>

      {/* More: bottom sheet with the full nav as grouped lists. */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent
          side="bottom"
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="max-h-[88dvh] gap-0 overflow-y-auto rounded-t-3xl border-0 bg-background p-0 pb-[env(safe-area-inset-bottom)] [&>button]:size-11"
        >
          <div aria-hidden className="mx-auto mt-2 h-1 w-9 rounded-full bg-muted-foreground/40" />
          <SheetHeader className="px-5 pt-3 pb-2 text-left">
            <SheetTitle className="ios-large-title !text-2xl">Menu</SheetTitle>
          </SheetHeader>

          <nav className="space-y-5 px-4 pt-2 pb-3">
            {NAV_GROUPS.map((group) => (
              <div key={group.label}>
                <div className="ios-section-title">{group.label}</div>
                <div className="divide-y overflow-hidden rounded-xl bg-card">
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
                    </Link>
                  ))}
                </div>
              </div>
            ))}

            <div>
              <div className="ios-section-title">Account</div>
              <div className="divide-y overflow-hidden rounded-xl bg-card">
                <div className="truncate px-4 py-3 text-sm text-muted-foreground">{user.email}</div>
                <div className="px-1 py-1">
                  <PushSubscribeButton />
                </div>
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
              <MadeWith className="mt-3 min-h-11 px-4" />
            </div>
          </nav>
        </SheetContent>
      </Sheet>

      <DemoBadge />

      {/* Main content */}
      <main className="min-w-0 flex-1 pt-[calc(2.75rem+env(safe-area-inset-top))] pb-[calc(3.25rem+env(safe-area-inset-bottom))] md:pt-0 md:pb-0 md:pl-64">
        <Outlet />
      </main>
    </div>
  );
}
