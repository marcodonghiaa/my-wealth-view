import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

// Error note (DESIGN.md "Alerts"): 10% loss wash, loss text, 8px corners.
export function Alert({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="alert"
      className={cn("rounded-lg bg-negative/10 px-4 py-3 text-sm text-negative", className)}
      {...props}
    />
  );
}
