"use client";

import * as React from "react";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

// Browser or phone Back closes an open sheet instead of leaving the page (#164). Opening adds a
// history entry on the same address (the router's state kept, so it sees no new page); Back pops
// it. Closing another way (X, Esc, overlay) takes the entry out again, unless the app has already
// moved to another entry (a link in the sheet), so that page is never undone.
// shortcut: Forward after Back re-enters the closed sheet's entry with no sheet open, so the next
// Back looks like it does nothing. Re-opening the sheet on Forward is not worth the code.
// How many sheets are open (Make a rule replaces the sheet's history entry), and the sides of
// the sheets on screen, newest last, so the toaster can keep out of their way.
let openSheets = 0;
type Side = NonNullable<VariantProps<typeof sheetVariants>["side"]>;
let sides: Side[] = [];
const sideListeners = new Set<() => void>();
const setSides = (next: Side[]) => {
  sides = next;
  sideListeners.forEach((l) => l());
};
export const isSheetOpen = () => openSheets > 0;
export function useOpenSheetSide() {
  return React.useSyncExternalStore(
    (l) => {
      sideListeners.add(l);
      return () => sideListeners.delete(l);
    },
    () => sides.at(-1) ?? null,
    () => null,
  );
}

// Dialogs use it too (#168), so isSheetOpen() also covers an open dialog.
export function useCloseOnBack(open: boolean, close: () => void) {
  const closeRef = React.useRef(close);
  closeRef.current = close;
  React.useEffect(() => {
    if (!open) return;
    const marker = Math.random().toString(36).slice(2);
    openSheets++;
    const push = () => window.history.pushState({ ...window.history.state, __sheet: marker }, "");
    push();
    let disposed = false;
    const onPop = () => {
      if (window.history.state?.__sheet === marker) return;
      closeRef.current();
      // Still open a tick later (it refused, e.g. mid-import): put its entry back, so the next
      // Back is caught too instead of leaving the page (polish-1 W2).
      setTimeout(() => {
        if (!disposed && window.history.state?.__sheet !== marker) push();
      });
    };
    window.addEventListener("popstate", onPop);
    return () => {
      disposed = true;
      window.removeEventListener("popstate", onPop);
      openSheets--;
      // After the router's queued navigation (a microtask) has landed. After Back the entry is
      // already gone, so this does nothing.
      setTimeout(() => {
        if (window.history.state?.__sheet === marker) window.history.back();
      });
    };
  }, [open]);
}

function Sheet(props: React.ComponentProps<typeof SheetPrimitive.Root>) {
  useCloseOnBack(!!props.open, () => props.onOpenChange?.(false));
  return <SheetPrimitive.Root {...props} />;
}

const SheetTrigger = SheetPrimitive.Trigger;

const SheetClose = SheetPrimitive.Close;

const SheetPortal = SheetPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    className={cn(
      "fixed inset-0 z-50 bg-black/40  data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
    ref={ref}
  />
));
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName;

const sheetVariants = cva(
  "fixed z-50 gap-4 bg-background p-6 transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500 data-[state=open]:animate-in data-[state=closed]:animate-out",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
        bottom:
          "inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        left: "inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
        right:
          "inset-y-0 right-0 h-full w-3/4 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm",
      },
    },
    defaultVariants: {
      side: "right",
    },
  },
);

interface SheetContentProps
  extends
    React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {}

// Mounted only while the sheet is on screen: SheetContent itself renders even when closed.
function OnScreen({ side, opener }: { side: Side; opener: React.RefObject<Element | null> }) {
  // Before Radix moves focus in (its effect runs after layout effects).
  React.useLayoutEffect(() => {
    opener.current = document.activeElement;
  }, [opener]);
  React.useEffect(() => {
    setSides([...sides, side]);
    return () => {
      const i = sides.lastIndexOf(side);
      setSides(sides.filter((_, j) => j !== i));
    };
  }, [side]);
  return null;
}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  SheetContentProps
>(
  (
    { side = "right", className, children, onPointerDownOutside, onCloseAutoFocus, ...props },
    ref,
  ) => {
    const opener = React.useRef<Element | null>(null);
    return (
      <SheetPortal>
        <SheetOverlay />
        <SheetPrimitive.Content
          ref={ref}
          className={cn(sheetVariants({ side }), className)}
          onPointerDownOutside={(e) => {
            // A toast shown over the sheet isn't a click outside: touching it must not close the sheet.
            if (e.target instanceof Element && e.target.closest("[data-sonner-toaster]"))
              e.preventDefault();
            onPointerDownOutside?.(e);
          }}
          // Our sheets open from state, not a SheetTrigger, so Radix has nothing to refocus on close
          // and focus fell to <body>. Hand it back to whatever had it before the sheet opened.
          onCloseAutoFocus={(e) => {
            onCloseAutoFocus?.(e);
            if (e.defaultPrevented) return;
            e.preventDefault();
            const el = opener.current;
            if (el instanceof HTMLElement && el.isConnected) el.focus();
          }}
          {...props}
        >
          <OnScreen side={side ?? "right"} opener={opener} />
          <SheetPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background cursor-pointer transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
          {children}
        </SheetPrimitive.Content>
      </SheetPortal>
    );
  },
);
SheetContent.displayName = SheetPrimitive.Content.displayName;

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-2 text-center sm:text-left", className)} {...props} />
);
SheetHeader.displayName = "SheetHeader";

const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)}
    {...props}
  />
);
SheetFooter.displayName = "SheetFooter";

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold text-foreground", className)}
    {...props}
  />
));
SheetTitle.displayName = SheetPrimitive.Title.displayName;

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
SheetDescription.displayName = SheetPrimitive.Description.displayName;

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
