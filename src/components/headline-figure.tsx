import { formatPercent, numberFormat } from "@/lib/locale";
import { formatMoney } from "@/lib/transactions";

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
  const parts = numberFormat({
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).formatToParts(value);
  return (
    <div>
      <p className="figure-display">
        {parts.map((p, i) =>
          // A real minus, like the signed figures elsewhere (Intl gives a hyphen).
          p.type === "minusSign" ? (
            "−"
          ) : p.type === "currency" ? (
            <span key={i} className="text-muted-foreground">
              {p.value}
            </span>
          ) : p.type === "decimal" || p.type === "fraction" ? (
            // Cents at 55%, wherever the locale puts the symbol (€1,234.56 or 1.234,56 €).
            <span key={i} className="opacity-55">
              {p.value}
            </span>
          ) : (
            p.value
          ),
        )}
      </p>
      {delta && (
        <p className="mt-2 flex flex-wrap items-baseline gap-x-2 text-[0.8125rem]">
          <span
            className={`font-figure ${
              delta.value > 0
                ? "text-positive"
                : delta.value < 0
                  ? "text-negative"
                  : "text-foreground"
            }`}
          >
            {delta.value > 0 ? "+" : delta.value < 0 ? "−" : ""}
            {formatMoney(Math.abs(delta.value), currency)}
            {delta.percent != null && ` (${formatPercent(delta.percent, { signed: true })})`}
          </span>
          <span className="text-muted-foreground">{delta.label}</span>
        </p>
      )}
    </div>
  );
}
