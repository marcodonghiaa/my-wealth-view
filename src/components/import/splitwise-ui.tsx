import type { ReactNode } from "react";

// The few pieces the Splitwise import steps share, so both screens read as one flow.

export const PILL =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-[0.9375rem] font-medium transition-colors motion-safe:active:scale-[0.98] disabled:opacity-45 disabled:active:scale-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";
export const PRIMARY = `${PILL} bg-primary text-primary-foreground hover:bg-primary/90`;
export const TINTED = `${PILL} bg-foreground/[0.07] hover:bg-foreground/10`;
/** The full-width call to action at the bottom of a step. */
export const CTA = `${PRIMARY} min-h-13 w-full text-base font-semibold`;
export const LINK =
  "inline-flex min-h-11 items-center text-[0.9375rem] font-medium text-primary hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none rounded-md";

/** Where you are in the flow: one capsule per step, the current one longer. */
export function Steps({ current, total = 2 }: { current: number; total?: number }) {
  return (
    <div
      role="img"
      aria-label={`Step ${current} of ${total}`}
      className="flex items-center gap-1.5"
    >
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`h-1 rounded-full transition-all duration-300 ${
            i + 1 === current ? "w-10 bg-foreground" : "w-6 bg-foreground/15"
          }`}
        />
      ))}
    </div>
  );
}

/** An inset grouped list, as in iOS Settings: a small caps label above rows on one card. */
export function Group({
  label,
  footer,
  tone,
  children,
}: {
  label?: ReactNode;
  footer?: ReactNode;
  tone?: "warning" | undefined;
  children: ReactNode;
}) {
  return (
    <section>
      {label && (
        <h3 className="px-4 pb-2 text-[0.8125rem] font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </h3>
      )}
      <div
        className={`divide-y divide-border overflow-hidden rounded-2xl bg-card ${
          tone === "warning" ? "ring-1 ring-amber-500/35" : ""
        }`}
      >
        {children}
      </div>
      {footer && <div className="px-4 pt-2 text-[0.8125rem] text-muted-foreground">{footer}</div>}
    </section>
  );
}
