import { Users } from "lucide-react";

// Logos for the banks we know, served from /public/banks (keyed by lowercase bank name, the part
// of an account label before the currency, e.g. "Revolut EUR" -> "revolut"). Revolut and Wise
// are dark on transparent, so every logo sits on a white tile to stay visible in dark mode;
// Fineco's logo is a filled square and covers its tile.
const BANK_LOGO: Record<string, { src: string; fill?: boolean }> = {
  revolut: { src: "/banks/revolut.png" },
  wise: { src: "/banks/wise.png" },
  fineco: { src: "/banks/fineco.jpg", fill: true },
};

export function bankNameFromLabel(label: string): string {
  const parts = label.trim().split(/\s+/);
  const last = parts[parts.length - 1] ?? "";
  if (parts.length > 1 && /^[A-Z]{3}$/.test(last)) {
    return parts.slice(0, -1).join(" ");
  }
  return parts.join(" ");
}

export function AccountBadge({ label }: { label: string }) {
  const bankName = bankNameFromLabel(label);
  if (bankName.toLowerCase() === "splitwise") {
    return (
      <span
        title={label}
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary"
      >
        <Users className="size-4" aria-label="Splitwise" />
      </span>
    );
  }
  const logo = BANK_LOGO[bankName.toLowerCase()];
  if (logo) {
    return (
      <span
        title={label}
        className="inline-flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white"
      >
        <img
          src={logo.src}
          alt={bankName}
          className={logo.fill ? "size-full object-cover" : "size-5 object-contain"}
        />
      </span>
    );
  }
  return (
    <span
      title={label}
      className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-bold text-muted-foreground"
    >
      {bankName.slice(0, 1).toUpperCase()}
    </span>
  );
}
