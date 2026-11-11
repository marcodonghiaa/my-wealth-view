import { useState } from "react";
import { Select } from "@/components/ui/field";
import { formatDay } from "@/lib/date";
import { LOCALE_CHOICES, localeOverride, setLocaleOverride } from "@/lib/locale";
import { formatMoney } from "@/lib/transactions";

// How numbers and dates are written. Follows the browser unless picked here (this device only).
export function FormatsSection({
  reload = () => window.location.reload(),
}: {
  reload?: () => void;
}) {
  const [value, setValue] = useState(localeOverride);
  const [failed, setFailed] = useState(false);
  return (
    <section id="formats" aria-labelledby="formats-heading" className="scroll-mt-6">
      <h2 id="formats-heading" className="mb-4 text-[0.9375rem] font-medium text-muted-foreground">
        Number and date format
      </h2>
      <div className="max-w-sm space-y-3 rounded-lg bg-card p-5">
        <Select
          aria-label="Format"
          value={value}
          onChange={(e) => {
            const saved = setLocaleOverride(e.target.value);
            setFailed(!saved);
            // Only show a choice that took effect; the figures keep the old format otherwise.
            if (saved) setValue(e.target.value);
            // Every figure on the page re-renders in the new format.
            if (saved) reload();
          }}
        >
          {LOCALE_CHOICES.map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </Select>
        <p className="text-sm text-muted-foreground">
          Example:{" "}
          <span className="font-figure text-foreground">
            {/* A real minus, as in the transaction list. */}−{formatMoney(1234.5, "EUR")}
          </span>{" "}
          on <span className="text-foreground">{formatDay("2026-03-03")}</span>. Saved on this
          device.
        </p>
        {failed && (
          <p role="alert" className="text-sm text-negative">
            Couldn&apos;t save on this device: the browser blocks site storage.
          </p>
        )}
      </div>
    </section>
  );
}
