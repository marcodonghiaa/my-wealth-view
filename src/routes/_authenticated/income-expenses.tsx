import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDownRight, ArrowUpRight, Scale } from "lucide-react";
import { getSupabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/income-expenses")({
  head: () => ({
    meta: [
      { title: "Income vs Expenses — Finance Dashboard" },
      {
        name: "description",
        content: "Compare monthly income against expenses over time.",
      },
      {
        property: "og:title",
        content: "Income vs Expenses — Finance Dashboard",
      },
      {
        property: "og:description",
        content: "Compare monthly income against expenses over time.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: IncomeExpensesPage,
});

interface MonthlyRow {
  month: string | null;
  income_eur: number | null;
  expenses_eur: number | null;
}

async function fetchMonthly(): Promise<Array<MonthlyRow>> {
  const { data, error } = await getSupabase()
    .from("v_income_vs_expenses_monthly")
    .select("month,income_eur,expenses_eur")
    .order("month", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Array<MonthlyRow>;
}

function formatEur(value: number): string {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatMonthLabel(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    month: "short",
    year: "2-digit",
  });
}

function IncomeExpensesPage() {
  const query = useQuery({
    queryKey: ["income-vs-expenses"],
    queryFn: fetchMonthly,
  });

  const rows = useMemo(
    () =>
      (query.data ?? []).filter(
        (r): r is { month: string; income_eur: number; expenses_eur: number } =>
          r.month != null,
      ),
    [query.data],
  );

  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(
    now.getMonth() + 1,
  ).padStart(2, "0")}-01`;
  const current =
    rows.find((r) => r.month === currentMonthKey) ?? rows.at(-1) ?? null;

  const income = current?.income_eur ?? 0;
  const expenses = current?.expenses_eur ?? 0;
  const net = income - expenses;

  const chartData = rows.map((r) => ({
    ...r,
    label: formatMonthLabel(r.month),
  }));

  const currentMonthLabel = current
    ? new Date(`${current.month}T00:00:00`).toLocaleDateString("en-GB", {
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 md:py-12">
      <header className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Income vs Expenses
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          What came in versus what went out, month over month.
        </p>
      </header>

      {query.isError && (
        <div
          role="alert"
          className="mb-6 rounded-xl border border-negative/30 bg-negative/10 px-4 py-3 text-sm text-negative"
        >
          Couldn't load income vs expenses: {query.error.message}
        </div>
      )}

      {/* Headline cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <HeadlineCard
          icon={<ArrowUpRight className="size-4 text-positive" />}
          label="Income"
          sublabel={currentMonthLabel ?? undefined}
          value={income}
          pending={query.isPending}
          tone="positive"
        />
        <HeadlineCard
          icon={<ArrowDownRight className="size-4 text-negative" />}
          label="Expenses"
          sublabel={currentMonthLabel ?? undefined}
          value={expenses}
          pending={query.isPending}
          tone="negative"
        />
        <HeadlineCard
          icon={<Scale className="size-4 text-primary" />}
          label="Net"
          sublabel={currentMonthLabel ?? undefined}
          value={net}
          pending={query.isPending}
          tone={net >= 0 ? "positive" : "negative"}
        />
      </div>

      {/* Chart card */}
      <section className="rounded-2xl border bg-card p-4 card-ring sm:p-6">
        <div className="mb-4 flex items-center justify-between px-2">
          <h2 className="text-sm font-semibold text-foreground">
            Monthly trend
          </h2>
          <span className="text-xs text-muted-foreground">EUR</span>
        </div>
        <div className="h-80 w-full">
          {query.isPending ? (
            <div className="h-full w-full animate-pulse rounded-xl bg-muted/50" />
          ) : chartData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No income or expense data yet.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
                barGap={4}
              >
                <CartesianGrid
                  strokeDasharray="3 6"
                  stroke="var(--color-border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={24}
                />
                <YAxis
                  width={70}
                  tickFormatter={(v: number) =>
                    Math.abs(v) >= 1000
                      ? `€${Math.round(v / 1000)}k`
                      : `€${v}`
                  }
                  tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  content={<IncomeTooltip />}
                  cursor={{ fill: "var(--color-muted)", fillOpacity: 0.3 }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12, color: "var(--color-muted-foreground)" }}
                />
                <Bar
                  name="Income"
                  dataKey="income_eur"
                  fill="var(--color-positive)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={32}
                />
                <Bar
                  name="Expenses"
                  dataKey="expenses_eur"
                  fill="var(--color-negative)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={32}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>
    </div>
  );
}

function HeadlineCard({
  icon,
  label,
  sublabel,
  value,
  pending,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  sublabel: string | undefined;
  value: number;
  pending: boolean;
  tone: "positive" | "negative";
}) {
  return (
    <section className="rounded-2xl border bg-card p-5 card-ring">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        {label}
        {sublabel && <span className="ml-1 text-xs">· {sublabel}</span>}
      </div>
      <div className="mt-2 min-h-9">
        {pending ? (
          <div className="h-8 w-28 animate-pulse rounded-lg bg-muted" />
        ) : (
          <p
            className={`font-figure text-3xl font-semibold tracking-tight ${
              tone === "positive" ? "text-positive" : "text-negative"
            }`}
          >
            {formatEur(value)}
          </p>
        )}
      </div>
    </section>
  );
}

interface TooltipEntry {
  dataKey?: string;
  value?: number;
}

function IncomeTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<TooltipEntry>;
  label?: string;
}) {
  if (!active || !payload?.length || !label) return null;
  const income = payload.find((p) => p.dataKey === "income_eur")?.value ?? 0;
  const expenses =
    payload.find((p) => p.dataKey === "expenses_eur")?.value ?? 0;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-lg">
      <p className="mb-1 text-xs text-muted-foreground">{label}</p>
      <p className="font-figure text-positive">Income {formatEur(income)}</p>
      <p className="font-figure text-negative">
        Expenses {formatEur(expenses)}
      </p>
      <p className="font-figure mt-1 border-t pt-1 text-foreground">
        Net {formatEur(income - expenses)}
      </p>
    </div>
  );
}
