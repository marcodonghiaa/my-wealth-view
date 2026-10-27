import { LockKeyhole } from "lucide-react";

// What the app can and cannot do with the user's money, stated where they sign in and navigate.
export function TrustNote({ className = "" }: { className?: string }) {
  return (
    <p className={`flex gap-2 text-xs leading-relaxed text-muted-foreground ${className}`}>
      <LockKeyhole aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      <span>
        Your data stays in your own database. Bank access is read-only. Not financial advice.
      </span>
    </p>
  );
}
