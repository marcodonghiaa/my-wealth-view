import { formatMoney } from "@/lib/transactions";

const pct = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v * 100).toFixed(1)}%`;

export type HeadlineDelta = {
  /** Change over the period, in `currency`. Sign decides the colour. */
  value: number;
  /** Fraction (0.012 = +1.2%). */
  percent?: number;
  /** Plain context ("Month", "YTD"), set in sans muted. */
  label: string;
};

// A screen's one headline amount, set in Fragment Mono. Whole units, currency symbol and
// cents share one size; the symbol is muted and the cents sit at 55% so the integer leads.
export function HeadlineFigure({
  value,
  currency,
  delta,
}: {
  value: number;
  currency: string;
  delta?: HeadlineDelta;
}) {
  const parts = new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).formatToParts(value);
  const cut = parts.findIndex((p) => p.type === "decimal");
  const wholeParts = cut < 0 ? parts : parts.slice(0, cut);
  const cents = cut < 0 ? "" : parts.slice(cut).map((p) => p.value).join("");
  return (
    <div>
      <p className="figure-display">
        {wholeParts.map((p, i) =>
          p.type === "currency" ? (
            <span key={i} className="text-muted-foreground">
              {p.value}
            </span>
          ) : (
            p.value
          ),
        )}
        <span className="opacity-55">{cents}</span>
      </p>
      {delta && (
        <p className="mt-2 flex flex-wrap items-baseline gap-x-2 text-[0.8125rem]">
          <span
            className={`font-figure ${
              delta.value > 0 ? "text-positive" : delta.value < 0 ? "text-negative" : "text-foreground"
            }`}
          >
            {delta.value > 0 ? "+" : delta.value < 0 ? "−" : ""}
            {formatMoney(Math.abs(delta.value), currency)}
            {delta.percent != null && ` (${pct(delta.percent)})`}
          </span>
          <span className="text-muted-foreground">{delta.label}</span>
        </p>
      )}
    </div>
  );
}
