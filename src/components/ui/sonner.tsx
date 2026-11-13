import { Toaster as Sonner } from "sonner";
import { useOpenSheetSide } from "./sheet";
import { useIsMobile } from "@/lib/use-is-mobile";

type ToasterProps = React.ComponentProps<typeof Sonner>;

// sonner paints toasts from its own variables, so point them at the app's palette (light and
// dark both, #169).
const palette = {
  "--normal-bg": "var(--popover)",
  "--normal-text": "var(--popover-foreground)",
  "--normal-border": "var(--border)",
} as React.CSSProperties;

// The phone tab bar (52px + safe area) and a gap.
const aboveTabBar = { bottom: "calc(3.25rem + env(safe-area-inset-bottom) + 0.5rem)" };

const Toaster = ({ ...props }: ToasterProps) => {
  const sheetSide = useOpenSheetSide();
  // sonner's mobileOffset stops at 600px, but the tab bar shows below md (768px).
  const isMobile = useIsMobile();
  return (
    <Sonner
      // An open sheet or dialog turns pointer events off on the page; a toast over it still takes
      // them (swipe away, hover to pause, its buttons).
      className="toaster group pointer-events-auto"
      // Follows the system like the rest of the app; sonner's default is always light (#169).
      theme="system"
      style={palette}
      // Bottom centre: top-right toasts covered the month arrows (#166). On a phone, clear of the
      // bottom tab bar (52px + safe area) and the home indicator. While a bottom sheet is open, top
      // centre, so a toast never covers a bottom sheet's fields; beside a right-hand panel, bottom
      // left, so it never covers the panel's title.
      position={
        sheetSide === "bottom"
          ? "top-center"
          : sheetSide === "right"
            ? "bottom-left"
            : "bottom-center"
      }
      mobileOffset={aboveTabBar}
      {...(isMobile && { offset: aboveTabBar })}
      toastOptions={{
        classNames: {
          // Colours come from `palette` (and sonner's own description and cancel greys): its
          // unlayered CSS beats Tailwind's colour utilities, so none are set here.
          toast: "group toast",
          // 44px tall: the button is often tapped on a phone ("Make a rule").
          actionButton: "min-h-11",
          cancelButton: "min-h-11",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
