import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      // An open sheet or dialog turns pointer events off on the page; a toast over it still takes
      // them (swipe away, hover to pause, its buttons).
      className="toaster group pointer-events-auto"
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
