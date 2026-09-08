import { createFileRoute, Outlet, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  TrendingUp,
  Landmark,
  Receipt,
  Repeat,
  PieChart,
  ArrowLeftRight,
  Briefcase,
  Bitcoin,
  ListChecks,
  Sparkles,
  Menu,
  type LucideIcon,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export const Route = createFileRoute("/demo")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Live Demo — Finance Dashboard" },
      {
        name: "description",
        content:
          "A read-only walkthrough of the Finance Dashboard, populated with sample data.",
      },
    ],
  }),
  component: DemoLayout,
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
    items: [{ label: "Net Worth", icon: TrendingUp, to: "/demo" }],
  },
  {
    label: "Banking",
    items: [
      { label: "Accounts", icon: Landmark, to: "/demo/accounts" },
      { label: "Transactions", icon: Receipt, to: "/demo/transactions" },
      { label: "Subscriptions", icon: Repeat, to: "/demo/subscriptions" },
      { label: "Spending", icon: PieChart, to: "/demo/spending" },
      {
        label: "Income vs Expenses",
        icon: ArrowLeftRight,
        to: "/demo/income-expenses",
      },
      { label: "Rules", icon: ListChecks, to: "/demo/rules" },
    ],
  },
  {
    label: "Investing",
    items: [
      { label: "Portfolio", icon: Briefcase, to: "/demo/portfolio" },
      { label: "Crypto", icon: Bitcoin, to: "/demo/crypto" },
    ],
  },
];

function SignUpCta({ className = "" }: { className?: string }) {
  return (
    <a
      href="/auth"
      className={`flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-sidebar-accent ${className}`}
    >
      <Sparkles className="size-4" />
      Sign up for your own
    </a>
  );
}

function DemoLayout() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex min-h-dvh bg-background">
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

        <nav className="flex-1 space-y-4 px-3 py-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="px-3 pb-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground/60 uppercase">
                {group.label}
              </div>
              <div className="space-y-1">
                {group.items.map((item) => (
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
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t p-3">
          <div className="mb-2 truncate px-3 text-xs text-muted-foreground">
            Viewing sample data · read-only
          </div>
          <SignUpCta />
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="fixed inset-x-0 top-0 z-30 grid h-[calc(3.5rem+env(safe-area-inset-top))] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b bg-sidebar px-2 pt-[env(safe-area-inset-top)] md:hidden">
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              aria-label="Open menu"
              className="flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
            >
              <Menu className="size-5" />
            </button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="flex w-72 flex-col gap-0 border-r bg-sidebar p-0 [&>button]:size-11"
          >
            <SheetHeader className="border-b p-4">
              <SheetTitle className="flex items-center gap-2.5 text-sm font-semibold text-sidebar-foreground">
                <span className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <TrendingUp className="size-4" />
                </span>
                Finance Dashboard
              </SheetTitle>
            </SheetHeader>

            <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-3">
              {NAV_GROUPS.map((group) => (
                <div key={group.label}>
                  <div className="px-3 pb-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground/60 uppercase">
                    {group.label}
                  </div>
                  <div className="space-y-1">
                    {group.items.map((item) => (
                      <Link
                        key={item.label}
                        to={item.to}
                        activeOptions={{ exact: true }}
                        onClick={() => setMenuOpen(false)}
                        className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
                        activeProps={{
                          className:
                            "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium bg-sidebar-accent text-sidebar-primary",
                        }}
                      >
                        <item.icon className="size-4 shrink-0" />
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </nav>

            <div className="border-t p-3">
              <div className="mb-2 truncate px-3 text-xs text-muted-foreground">
                Viewing sample data · read-only
              </div>
              <SignUpCta />
            </div>
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 items-center gap-2">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <TrendingUp className="size-3.5" />
          </div>
          <span className="truncate text-sm font-semibold text-sidebar-foreground">
            Finance Dashboard
          </span>
        </div>
        <a
          href="/auth"
          aria-label="Sign up"
          className="flex size-11 items-center justify-center rounded-lg text-primary transition-colors hover:bg-sidebar-accent"
        >
          <Sparkles className="size-5" />
        </a>
      </div>

      {/* Main content */}
      <main className="min-w-0 flex-1 pt-[calc(3.5rem+env(safe-area-inset-top))] pb-[env(safe-area-inset-bottom)] md:pt-0 md:pb-0 md:pl-64">
        <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 border-b bg-primary/10 px-4 py-2 text-center text-xs font-medium text-primary md:top-0">
          You're viewing a live demo with sample data — everything here is
          read-only.{" "}
          <a href="/auth" className="underline underline-offset-2">
            Sign up
          </a>{" "}
          to connect your own accounts.
        </div>
        <Outlet />
      </main>
    </div>
  );
}
