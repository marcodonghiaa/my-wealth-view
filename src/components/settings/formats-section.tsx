import { useState } from "react";
import { fieldClass } from "@/components/ui/field";
import { formatDay } from "@/lib/date";
import { LOCALE_CHOICES, localeOverride, setLocaleOverride } from "@/lib/locale";
import { formatMoney } from "@/lib/transactions";

const field = fieldClass();

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
        <select
          aria-label="Format"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            const saved = setLocaleOverride(e.target.value);
            setFailed(!saved);
            // Every figure on the page re-renders in the new format.
            if (saved) reload();
          }}
          className={field}
        >
          {LOCALE_CHOICES.map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </select>
        <p className="text-sm text-muted-foreground">
          Example:{" "}
          <span className="font-figure text-foreground">{formatMoney(-1234.5, "EUR")}</span> on{" "}
          <span className="text-foreground">{formatDay("2026-03-03")}</span>. Saved on this device.
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
