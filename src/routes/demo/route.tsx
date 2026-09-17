import { createFileRoute, Outlet, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  TrendingUp,
  Landmark,
  Receipt,
  Repeat,
  PieChart,
  Briefcase,
  Bitcoin,
  Github,
  MoreHorizontal,
  FileText,
  ArrowDownLeft,
  HandCoins,
  type LucideIcon,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const REPO_URL = "https://github.com/marcodonghiaa/my-wealth-view";

export const Route = createFileRoute("/demo")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Live Demo — MyFinances" },
      {
        name: "description",
        content:
          "A read-only walkthrough of MyFinances, populated with sample data.",
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
    items: [
      { label: "Net Worth", icon: TrendingUp, to: "/demo" },
      { label: "Reports", icon: FileText, to: "/demo/reports" },
    ],
  },
  {
    label: "Banking",
    items: [
      { label: "Transactions", icon: Receipt, to: "/demo/transactions" },
      { label: "Spending", icon: PieChart, to: "/demo/spending" },
      { label: "Accounts", icon: Landmark, to: "/demo/accounts" },
      { label: "Subscriptions", icon: Repeat, to: "/demo/subscriptions" },
      { label: "Income", icon: ArrowDownLeft, to: "/demo/income" },
      { label: "Owed", icon: HandCoins, to: "/demo/owed" },
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

const TAB_BAR_ITEMS: Array<{ label: string; icon: LucideIcon; to: string }> = [
  { label: "Net Worth", icon: TrendingUp, to: "/demo" },
  { label: "Transactions", icon: Receipt, to: "/demo/transactions" },
  { label: "Spending", icon: PieChart, to: "/demo/spending" },
  { label: "Portfolio", icon: Briefcase, to: "/demo/portfolio" },
];

function SignUpCta({ className = "" }: { className?: string }) {
  return (
    <a
      href={REPO_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-sidebar-accent ${className}`}
    >
      <Github className="size-4" />
      Self-host your own
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
            MyFinances
          </span>
        </div>

        <nav className="flex-1 space-y-4 px-3 py-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="px-3 pb-1.5 text-xs font-semibold tracking-wider text-muted-foreground/60 uppercase">
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

      {/* Mobile top bar — primary nav lives in the bottom tab bar below;
          this Sheet is reached via the "More" tab. */}
      <div className="fixed inset-x-0 top-0 z-30 grid h-[calc(3.5rem+env(safe-area-inset-top))] grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b bg-sidebar px-4 pt-[env(safe-area-inset-top)] md:hidden">
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetContent
            side="left"
            className="flex w-72 flex-col gap-0 border-r bg-sidebar p-0 [&>button]:size-11"
          >
            <SheetHeader className="border-b p-4">
              <SheetTitle className="flex items-center gap-2.5 text-sm font-semibold text-sidebar-foreground">
                <span className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <TrendingUp className="size-4" />
                </span>
                MyFinances
              </SheetTitle>
            </SheetHeader>

            <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-3">
              {NAV_GROUPS.map((group) => (
                <div key={group.label}>
                  <div className="px-3 pb-1.5 text-xs font-semibold tracking-wider text-muted-foreground/60 uppercase">
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
            MyFinances
          </span>
        </div>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Self-host your own"
          className="flex size-11 items-center justify-center rounded-lg text-primary transition-colors hover:bg-sidebar-accent"
        >
          <Github className="size-5" />
        </a>
      </div>

      {/* Mobile bottom tab bar */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 grid h-[calc(4rem+env(safe-area-inset-bottom))] grid-cols-5 border-t bg-sidebar pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {TAB_BAR_ITEMS.map((item) => (
          <Link
            key={item.label}
            to={item.to}
            activeOptions={{ exact: true }}
            className="flex flex-col items-center justify-center gap-1 text-muted-foreground transition-transform active:scale-90"
            activeProps={{ className: "flex flex-col items-center justify-center gap-1 text-sidebar-primary transition-transform active:scale-90" }}
          >
            <item.icon className="size-5" />
            <span className="text-xs font-medium">{item.label}</span>
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="More"
          className="flex flex-col items-center justify-center gap-1 text-muted-foreground transition-transform active:scale-90"
        >
          <MoreHorizontal className="size-5" />
          <span className="text-xs font-medium">More</span>
        </button>
      </nav>

      {/* Main content */}
      <main className="min-w-0 flex-1 pt-[calc(3.5rem+env(safe-area-inset-top))] pb-[calc(4rem+env(safe-area-inset-bottom))] md:pt-0 md:pb-0 md:pl-64">
        <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 border-b bg-primary/10 px-4 py-2 text-center text-xs font-medium text-primary md:top-0">
          You're viewing a live demo with sample data — everything here is
          read-only.{" "}
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            Self-host it
          </a>{" "}
          to connect your own accounts.
        </div>
        <Outlet />
      </main>
    </div>
  );
}
