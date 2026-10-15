import { Banknote } from "lucide-react";

// Brand tint per bank, keyed by the bank name our account labels start with
// (e.g. "Revolut EUR" -> "Revolut"). No external logos: a tinted monogram tile.
const BANK_COLOR: Record<string, string> = {
  Revolut: "var(--color-chart-1)",
  Wise: "var(--color-chart-2)",
  Fineco: "var(--color-chart-3)",
};

export function bankNameFromLabel(label: string): string {
  const parts = label.trim().split(/\s+/);
  const last = parts[parts.length - 1] ?? "";
  if (parts.length > 1 && /^[A-Z]{3}$/.test(last)) {
    return parts.slice(0, -1).join(" ");
  }
  return parts.join(" ");
}

export function bankColor(bankName: string): string | null {
  return BANK_COLOR[bankName] ?? null;
}

export function AccountBadge({ label }: { label: string }) {
  const bankName = bankNameFromLabel(label);
  const color = bankColor(bankName);
  return (
    <span
      title={label}
      className={`inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
        color ? "" : "bg-muted text-muted-foreground"
      }`}
      style={
        color
          ? { backgroundColor: `color-mix(in srgb, ${color} 22%, transparent)`, color }
          : undefined
      }
    >
      {bankName.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function CurrencyBadge({ currency }: { currency: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground">
      <Banknote className="size-3" />
      {currency}
    </span>
  );
}
