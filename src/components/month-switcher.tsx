import { ChevronLeft, ChevronRight } from "lucide-react";

interface MonthSwitcherProps {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  canGoNext: boolean;
  className?: string;
}

// The month a screen is showing, named as a heading, with round step buttons beside it.
export function MonthSwitcher({
  label,
  onPrev,
  onNext,
  canGoNext,
  className = "",
}: MonthSwitcherProps) {
  const step =
    "flex size-11 items-center justify-center rounded-full bg-card text-foreground transition-colors hover:bg-accent disabled:opacity-40";
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <span
        aria-live="polite"
        className="mr-auto text-xl font-semibold tracking-[-0.02em] text-foreground"
      >
        {label}
      </span>
      <button type="button" onClick={onPrev} aria-label="Previous month" className={step}>
        <ChevronLeft className="size-5" />
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={!canGoNext}
        aria-label="Next month"
        className={step}
      >
        <ChevronRight className="size-5" />
      </button>
    </div>
  );
}
