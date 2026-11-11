import { formatPercent } from "@/lib/locale";
import { Link } from "@tanstack/react-router";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import {
  Bitcoin,
  Building2,
  ChevronRight,
  CreditCard,
  Landmark,
  ScrollText,
  Shapes,
} from "lucide-react";
import { shareSummary } from "@/lib/chart-summary";
import { formatDay } from "@/lib/date";
import {
  allocationHistory,
  type HistoryRow,
  type NetWorthRow,
  type ReconstructedRow,
  STOCKS_LABEL,
} from "@/lib/net-worth";
import { formatEur } from "@/lib/transactions";
import { ASSET_COLORS } from "@/lib/asset-colors";
import type { ReactNode } from "react";

// Each class leads to the page that explains it. The stocks row is everything in the portfolio
// that isn't a bond (stocks, ETFs, funds), so it reads as the sum of those rows on Portfolio.
const CLASSES = [
  {
    key: "stocks_eur",
    label: STOCKS_LABEL,
    color: ASSET_COLORS.stock,
    icon: Building2,
    to: "/portfolio",
  },
  {
    key: "bonds_eur",
    label: "Bonds",
    color: ASSET_COLORS.bond,
    icon: ScrollText,
    to: "/portfolio",
  },
  {
    key: "crypto_eur",
    label: "Crypto",
    color: ASSET_COLORS.crypto,
    icon: Bitcoin,
    to: "/crypto",
  },
  { key: "cash_eur", label: "Cash", color: ASSET_COLORS.cash, icon: Landmark, to: "/accounts" },
  {
    key: "other_eur",
    label: "Unallocated",
    color: ASSET_COLORS.other,
    icon: Shapes,
    to: null,
  },
] as const;

type RowTarget = "/portfolio" | "/crypto" | "/accounts" | null;

// A breakdown row; with a target it is a link to that page, with a chevron.
function Row({ to, children }: { to: RowTarget; children: ReactNode }) {
  const row = "flex min-h-16 items-center gap-3 py-2.5";
  return (
    <li>
      {to ? (
        <Link
          to={to}
          className={`${row} -mx-2 rounded-sm px-2 transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring`}
        >
          {children}
          <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        </Link>
      ) : (
        <div className={row}>{children}</div>
      )}
    </li>
  );
}

// What net worth is made of: a donut of the mix with each class's share and value beside it,
// for today or for `asOf` (the day being scrubbed on the chart above).
// Shares are of what you hold; debts follow as a negative line, so the values add up to net worth.
export function AllocationChart({
  history,
  snapshots,
  reconstructed = [],
  asOf,
  format = formatEur,
}: {
  history: Array<HistoryRow>;
  snapshots: Array<NetWorthRow>;
  reconstructed?: Array<ReconstructedRow>;
  asOf?: string | undefined;
  format?: (eur: number) => string;
}) {
  const rows = allocationHistory(history, snapshots, undefined, reconstructed);
  const row = asOf
    ? (rows.filter((r) => r.snapshot_date <= asOf).at(-1) ?? rows.at(-1))
    : rows.at(-1);
  if (!row) return null;
  const slices = CLASSES.map((c) => ({ ...c, value: row[c.key] ?? 0 })).filter((s) => s.value > 0);
  const gross = slices.reduce((sum, s) => sum + s.value, 0);
  if (gross <= 0) return null;
  const debts = row.liabilities_eur ?? 0;

  return (
    <section aria-labelledby="allocation-title" className="rounded-lg bg-card p-5 sm:p-6">
      <h2 id="allocation-title" className="text-lg font-semibold text-foreground">
        Breakdown
      </h2>
      <p className="text-xs text-muted-foreground">As of {formatDay(row.snapshot_date)}</p>

      <div className="mt-2 flex flex-col items-center sm:mt-4 sm:flex-row sm:gap-10">
        {/* Phones drop the donut: the rows carry each share, and the colours alone say nothing. */}
        <div
          className="hidden size-48 shrink-0 sm:block"
          role="img"
          aria-label={shareSummary(
            "Breakdown",
            slices.map((s) => ({ label: s.label, value: s.value })),
          )}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={slices}
                dataKey="value"
                nameKey="label"
                innerRadius="62%"
                outerRadius="100%"
                startAngle={90}
                endAngle={-270}
                stroke="var(--color-card)"
                strokeWidth={2}
                isAnimationActive={false}
              >
                {slices.map((s) => (
                  <Cell key={s.key} fill={s.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>

        <ul className="w-full flex-1 divide-y divide-hairline">
          {slices.map(({ key, label, color, icon: Icon, value, to }) => (
            <Row key={key} to={to}>
              <span
                aria-hidden
                className="flex size-10 shrink-0 items-center justify-center rounded-full"
                style={{
                  color,
                  backgroundColor: `color-mix(in oklab, ${color} 16%, var(--color-card))`,
                }}
              >
                <Icon className="size-[1.125rem]" strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{label}</p>
                <p className="font-figure text-xs text-muted-foreground">
                  {formatPercent(value / gross)}
                </p>
              </div>
              <p className="font-figure text-sm text-foreground">{format(value)}</p>
            </Row>
          ))}
          {debts > 0 && (
            <Row to="/accounts">
              <span
                aria-hidden
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-negative/10 text-negative"
              >
                <CreditCard className="size-[1.125rem]" strokeWidth={2} />
              </span>
              <p className="min-w-0 flex-1 text-sm font-medium text-foreground">Debts</p>
              <p className="font-figure text-sm text-foreground">{format(-debts)}</p>
            </Row>
          )}
        </ul>
      </div>
    </section>
  );
}
