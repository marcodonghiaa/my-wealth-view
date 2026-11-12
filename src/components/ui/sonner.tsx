import { Toaster as Sonner } from "sonner";
import { useAnySheetOpen } from "./sheet";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const sheetOpen = useAnySheetOpen();
  return (
    <Sonner
      // An open sheet or dialog turns pointer events off on the page; a toast over it still takes
      // them (swipe away, hover to pause, its buttons).
      className="toaster group pointer-events-auto"
      // Bottom centre: top-right toasts covered the month arrows (#166). On a phone, clear of the
      // bottom tab bar (52px + safe area) and the home indicator. While a sheet is open, top
      // centre, so a toast never covers a bottom sheet's fields.
      position={sheetOpen ? "top-center" : "bottom-center"}
      mobileOffset={{ bottom: "calc(3.25rem + env(safe-area-inset-bottom) + 0.5rem)" }}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          // 44px tall: the button is often tapped on a phone ("Make a rule").
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground min-h-11",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-foreground min-h-11",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
