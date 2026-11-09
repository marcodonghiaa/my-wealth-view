import { BrandMark } from "@/components/brand-mark";
import { showBranding } from "@/lib/branding";

const SITE_URL = "https://alopex.finance";

// Quiet credit at the end of every page: the fox mark and one line in caption type,
// muted until hovered. Self-hosters can hide it (VITE_HIDE_BRANDING).
export function MadeWith({ className = "" }: { className?: string }) {
  if (!showBranding()) return null;
  return (
    <a
      href={SITE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`group inline-flex shrink-0 items-center gap-1.5 rounded-sm text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${className}`}
    >
      <BrandMark className="size-3.5 text-muted-foreground transition-colors group-hover:text-foreground" />
      <span>
        Made with <span className="font-medium">Alopex</span>
      </span>
    </a>
  );
}
