import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

// White list on the snow ground (DESIGN.md "Grouped Lists"): 8px corners, hairline dividers, no outline.
export function GroupedList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("divide-y divide-hairline overflow-hidden rounded-lg bg-card", className)}
      {...props}
    />
  );
}

// The muted 13px label above a grouped list, inset to line up with the rows.
export function SectionTitle({
  children,
  action,
  className,
}: {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-end justify-between gap-3 px-4 pb-1.5", className)}>
      <h2 className="text-[0.8125rem] leading-tight font-medium text-muted-foreground">
        {children}
      </h2>
      {action}
    </div>
  );
}
