import { ChevronLeft, ChevronRight } from "lucide-react";

interface MonthSwitcherProps {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  canGoNext: boolean;
  className?: string;
}

// The month a screen is showing, with hairline square step buttons beside it.
export function MonthSwitcher({
  label,
  onPrev,
  onNext,
  canGoNext,
  className = "",
}: MonthSwitcherProps) {
  const step =
    "flex size-9 items-center justify-center rounded-md border border-rule bg-card text-foreground transition-colors hover:bg-accent disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <span aria-live="polite" className="mr-auto text-[15px] font-medium text-foreground">
        {label}
      </span>
      <button type="button" onClick={onPrev} aria-label="Previous month" className={step}>
        <ChevronLeft className="size-4" />
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={!canGoNext}
        aria-label="Next month"
        className={step}
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}
