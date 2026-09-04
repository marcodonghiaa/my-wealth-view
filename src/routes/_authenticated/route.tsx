import {
  createFileRoute,
  Outlet,
  Link,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  TrendingUp,
  PieChart,
  ArrowLeftRight,
  Briefcase,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { getSupabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await getSupabase().auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth" });
    }
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

interface NavItem {
  label: string;
  icon: LucideIcon;
  to?: string;
  soon?: boolean;
}

const NAV_ITEMS: Array<NavItem> = [
  { label: "Net Worth", icon: TrendingUp, to: "/" },
  { label: "Spending", icon: PieChart, soon: true },
  { label: "Income vs Expenses", icon: ArrowLeftRight, soon: true },
  { label: "Portfolio", icon: Briefcase, soon: true },
];

function AuthenticatedLayout() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  // Keep route data in sync with auth transitions (e.g. token expiry).
  useEffect(() => {
    const {
      data: { subscription },
    } = getSupabase().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        void navigate({ to: "/auth", replace: true });
      }
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  async function handleSignOut() {
    setSigningOut(true);
    await getSupabase().auth.signOut();
    await navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-sidebar md:flex">
        <div className="flex h-16 items-center gap-2.5 border-b px-5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <TrendingUp className="size-4" />
          </div>
          <span className="text-sm font-semibold tracking-tight text-sidebar-foreground">
            Finance Dashboard
          </span>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {NAV_ITEMS.map((item) =>
            item.to ? (
              <Link
                key={item.label}
                to={item.to}
                activeOptions={{ exact: true }}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
                activeProps={{
                  className:
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium bg-sidebar-accent text-sidebar-primary",
                }}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            ) : (
              <div
                key={item.label}
                aria-disabled
                className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground/50"
              >
                <item.icon className="size-4" />
                {item.label}
                <span className="ml-auto rounded-full border px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground/60 uppercase">
                  Soon
                </span>
              </div>
            ),
          )}
        </nav>

        <div className="border-t p-3">
          <div className="mb-2 truncate px-3 text-xs text-muted-foreground">
            {user.email}
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground disabled:opacity-50"
          >
            <LogOut className="size-4" />
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b bg-sidebar px-4 md:hidden">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <TrendingUp className="size-3.5" />
          </div>
          <span className="text-sm font-semibold text-sidebar-foreground">
            Finance Dashboard
          </span>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          className="text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Sign out"
        >
          <LogOut className="size-4" />
        </button>
      </div>

      {/* Main content */}
      <main className="min-w-0 flex-1 pt-14 md:pt-0 md:pl-64">
        <Outlet />
      </main>
    </div>
  );
}
