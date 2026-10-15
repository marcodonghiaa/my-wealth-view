import { useState } from "react";
import { maskIban } from "@/lib/iban";

// Screenshots of a finance app leak account numbers, so show only the last four until asked.
export function MaskedIban({ iban }: { iban: string }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setRevealed((r) => !r)}
      aria-label={revealed ? "Hide full IBAN" : "Show full IBAN"}
      className="-my-2 max-w-full truncate rounded py-2 text-left font-figure focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {revealed ? iban : maskIban(iban)}
    </button>
  );
}
