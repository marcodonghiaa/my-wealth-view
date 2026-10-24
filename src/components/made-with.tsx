import { Heart } from "lucide-react";
import { showBranding } from "@/lib/branding";

const REPO_URL = "https://github.com/marcodonghiaa/my-wealth-view";

export function MadeWith({ className = "" }: { className?: string }) {
  if (!showBranding()) return null;
  return (
    <a
      href={REPO_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground ${className}`}
    >
      Made with MyFinances
      <Heart aria-hidden className="size-3 fill-current" />
    </a>
  );
}
