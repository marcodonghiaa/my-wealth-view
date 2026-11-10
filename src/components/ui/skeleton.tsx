import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

// Loading block in Fill at the control radius (DESIGN.md "Loading").
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div aria-hidden className={cn("animate-pulse rounded-sm bg-muted", className)} {...props} />
  );
}
