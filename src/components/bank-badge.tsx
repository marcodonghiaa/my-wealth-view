import { Banknote } from "lucide-react";

// Bank logos are Enable Banking's public brand assets (same source used to
// build the consent-flow links), keyed by the bank name our account labels
// start with (e.g. "Revolut EUR" -> "Revolut").
const BANK_META: Record<string, { logo: string; color: string }> = {
  Revolut: {
    logo: "https://enablebanking.com/brands/IT/Revolut/",
    color: "var(--color-chart-1)",
  },
  Wise: {
    logo: "https://enablebanking.com/brands/IT/Wise/",
    color: "var(--color-chart-2)",
  },
  Fineco: {
    logo: "https://enablebanking.com/brands/IT/FinecoBank/",
    color: "var(--color-chart-3)",
  },
};

export function bankNameFromLabel(label: string): string {
  const parts = label.trim().split(/\s+/);
  const last = parts[parts.length - 1];
  if (parts.length > 1 && /^[A-Z]{3}$/.test(last)) {
    return parts.slice(0, -1).join(" ");
  }
  return parts.join(" ");
}

export function bankColor(bankName: string): string | null {
  return BANK_META[bankName]?.color ?? null;
}

export function AccountBadge({ label }: { label: string }) {
  const bankName = bankNameFromLabel(label);
  const meta = BANK_META[bankName];

  if (!meta) {
    return (
      <span
        title={label}
        className="inline-flex size-6 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground"
      >
        {bankName.slice(0, 1).toUpperCase()}
      </span>
    );
  }

  return (
    <span
      title={label}
      className="inline-flex items-center justify-center rounded-full p-1"
      style={{
        backgroundColor: `color-mix(in srgb, ${meta.color} 18%, transparent)`,
      }}
    >
      <img src={meta.logo} alt={bankName} className="h-4 w-auto object-contain" />
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
