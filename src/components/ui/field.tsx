import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

// Form fields (DESIGN.md "Inputs"): 44px, 4px corners, Rule outline, Ember ring on focus.
// `onGround` is for search and filters sitting straight on the page: white, no outline.
export function fieldClass(onGround = false) {
  return cn(
    "h-11 w-full min-w-0 rounded-sm px-3 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring disabled:opacity-50 md:text-sm",
    onGround ? "bg-card" : "border border-rule bg-background",
  );
}

type FieldProps = { onGround?: boolean };

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & FieldProps
>(function Input({ className, onGround, ...props }, ref) {
  return <input ref={ref} className={cn(fieldClass(onGround), className)} {...props} />;
});

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & FieldProps
>(function Select({ className, onGround, ...props }, ref) {
  return <select ref={ref} className={cn(fieldClass(onGround), className)} {...props} />;
});

// The sign-in pages' larger field, spaced out for a 6-digit code.
const LARGE_CODE_CLASS =
  "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-center font-mono text-lg tracking-[0.3em] text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary/60 focus:ring-2 focus:ring-ring";

/**
 * A code from an authenticator app: 6 digits, spaces or a dash allowed while typing.
 * `large` is the sign-in pages' look; the default is the form look.
 */
export const CodeInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { large?: boolean }
>(function CodeInput({ className, large, ...props }, ref) {
  return (
    <input
      ref={ref}
      required
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={9}
      placeholder="123456"
      className={cn(large ? LARGE_CODE_CLASS : fieldClass(), className)}
      {...props}
    />
  );
});
