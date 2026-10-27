// A screen's one headline amount: whole units large, cents small and muted, as a bank app sets a balance.
export function HeadlineFigure({ value, currency }: { value: number; currency: string }) {
  const parts = new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).formatToParts(value);
  const cut = parts.findIndex((p) => p.type === "decimal");
  const whole = (cut < 0 ? parts : parts.slice(0, cut)).map((p) => p.value).join("");
  const cents =
    cut < 0
      ? ""
      : parts
          .slice(cut)
          .map((p) => p.value)
          .join("");
  return (
    <p className="figure-display">
      {whole}
      <span className="text-[0.5em] font-medium tracking-[-0.02em] text-muted-foreground">
        {cents}
      </span>
    </p>
  );
}
