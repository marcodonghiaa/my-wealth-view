// Logos for the banks we know, served from /public/banks (keyed by lowercase bank name, the part
// of an account label before the currency, e.g. "Revolut EUR" -> "revolut"). Revolut and Wise
// are dark on transparent, so every logo sits on a white tile to stay visible in dark mode;
// Fineco's and Splitwise's logos are filled squares and cover their tile.
import { useState } from "react";

const BANK_LOGO: Record<string, { src: string; fill?: boolean }> = {
  revolut: { src: "/banks/revolut.png" },
  wise: { src: "/banks/wise.png" },
  fineco: { src: "/banks/fineco.jpg", fill: true },
  finecobank: { src: "/banks/fineco.jpg", fill: true }, // Enable Banking's name, stored as bank_name
  splitwise: { src: "/banks/splitwise.png", fill: true },
};

export function bankNameFromLabel(label: string): string {
  const parts = label.trim().split(/\s+/);
  const last = parts[parts.length - 1] ?? "";
  if (parts.length > 1 && /^[A-Z]{3}$/.test(last)) {
    return parts.slice(0, -1).join(" ");
  }
  return parts.join(" ");
}

// The bank's name: the one stored at link time, else read from the label (rows linked before
// bank_name existed, until the bank is renewed).
export function bankOf(a: { bank_name?: string | null; label: string | null }): string {
  return a.bank_name || bankNameFromLabel(a.label ?? "Bank account");
}

// "FinecoBank EUR": an account by bank and currency, not by the holder name EB uses as its label.
export function accountName(a: {
  bank_name?: string | null;
  label: string | null;
  currency: string;
}): string {
  return `${bankOf(a)} ${a.currency}`;
}

// `logo` is the URL Enable Banking lists for the bank, used only when we have no local file.
export function AccountBadge({
  label,
  bank,
  logo,
}: {
  label: string;
  bank?: string;
  logo?: string | null;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const bankName = bank ?? bankNameFromLabel(label);
  const local = BANK_LOGO[bankName.toLowerCase()];
  const src = local?.src ?? (logo?.startsWith("https://") ? logo : null);
  if (src && src !== failedSrc) {
    return (
      <span
        title={label}
        className="inline-flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white"
      >
        <img
          src={src}
          alt={bankName}
          referrerPolicy="no-referrer"
          onError={() => setFailedSrc(src)}
          className={local?.fill ? "size-full object-cover" : "size-5 object-contain"}
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
