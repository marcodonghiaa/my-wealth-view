import { ChevronLeft, ChevronRight } from "lucide-react";

interface MonthSwitcherProps {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  canGoNext: boolean;
  /** False at the earliest month the screen offers. Left out: no limit. */
  canGoPrev?: boolean;
  className?: string;
  /** What one step moves by, for the arrows' names ("Previous quarter"). */
  unit?: string;
}

// The month a screen is showing (DESIGN.md "Month Switcher"): a 20px title, 44px steps.
export function MonthSwitcher({
  label,
  onPrev,
  onNext,
  canGoNext,
  canGoPrev = true,
  className = "",
  unit = "month",
}: MonthSwitcherProps) {
  const step =
    "flex size-11 items-center justify-center rounded-sm bg-card text-foreground transition-colors hover:bg-accent disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <span
        aria-live="polite"
        className="mr-auto text-xl font-semibold tracking-[-0.02em] text-foreground"
      >
        {label}
      </span>
      <button
        type="button"
        onClick={onPrev}
        disabled={!canGoPrev}
        aria-label={`Previous ${unit}`}
        className={step}
      >
        <ChevronLeft className="size-4" />
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={!canGoNext}
        aria-label={`Next ${unit}`}
        className={step}
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}
