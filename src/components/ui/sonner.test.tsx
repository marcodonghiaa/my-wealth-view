import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { toast } from "sonner";
import { Toaster } from "./sonner";
import { Sheet, SheetContent, SheetTitle } from "./sheet";

describe("Toaster", () => {
  afterEach(() => vi.unstubAllGlobals());

  // polish-4 #A: sonner's phone offset stops at 600px, but the tab bar shows up to 767px.
  // fails_when=at 601-767px the bottom toast sits over the tab bar
  it("keeps toasts above the tab bar up to the md breakpoint", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: q === "(max-width: 767px)",
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    render(<Toaster />);
    act(() => void toast("Marked as regular"));
    await screen.findByText("Marked as regular");
    const list = document.querySelector("[data-sonner-toaster]") as HTMLElement;
    expect(list.style.getPropertyValue("--offset-bottom")).toContain("3.25rem");
  });

  it("uses the default bottom offset on desktop", async () => {
    render(<Toaster />);
    act(() => void toast("Saved"));
    await screen.findByText("Saved");
    const list = document.querySelector("[data-sonner-toaster]") as HTMLElement;
    expect(list.style.getPropertyValue("--offset-bottom")).not.toContain("3.25rem");
  });

  // Polish pass 4 #3: the toast's button ("Make a rule") was 24px tall, too small to tap.
  it("gives a toast's button a 44px tap target", async () => {
    render(<Toaster />);
    act(() => void toast("Saved", { action: { label: "Make a rule", onClick: vi.fn() } }));
    expect(await screen.findByRole("button", { name: "Make a rule" })).toHaveClass("min-h-11");
  });

  // Polish 4 #3: Undo moved to the second (cancel) button beside Re-sort; it keeps 44px too.
  it("gives a toast's second button a 44px tap target", async () => {
    render(<Toaster />);
    act(() => void toast("Rule deleted", { cancel: { label: "Undo", onClick: vi.fn() } }));
    expect(await screen.findByRole("button", { name: "Undo" })).toHaveClass("min-h-11");
  });

  // polish-4 #13: an open sheet turns pointer events off on the page. fails_when=a toast over a
  // sheet can't be swiped away or hovered to pause
  it("takes pointer events even while a sheet has them off", async () => {
    render(<Toaster />);
    act(() => void toast("Couldn't save note"));
    await screen.findByText("Couldn't save note");
    expect(document.querySelector("[data-sonner-toaster]")).toHaveClass("pointer-events-auto");
  });

  // Issue #166: top-right toasts covered the month arrows (Income, other month screens) for their
  // whole life. fails_when=toasts sit at the top, or on a phone sit over the bottom tab bar
  it("shows toasts at the bottom centre, above the phone tab bar", async () => {
    render(<Toaster />);
    act(() => void toast("Marked as regular"));
    await screen.findByText("Marked as regular");
    const list = document.querySelector("[data-sonner-toaster]") as HTMLElement;
    expect(list).toHaveAttribute("data-y-position", "bottom");
    expect(list).toHaveAttribute("data-x-position", "center");
    expect(list.style.getPropertyValue("--mobile-offset-bottom")).toContain("3.25rem");
  });

  // polish-1 #3: on a phone the edit sheet fills the bottom of the screen; a bottom toast covered
  // its fields. fails_when=a toast shown while a bottom sheet is open sits at the bottom
  it("moves toasts to the top while a bottom sheet is open", async () => {
    const { rerender } = render(
      <>
        <Toaster />
        <Sheet open onOpenChange={vi.fn()}>
          <SheetContent side="bottom" aria-describedby={undefined}>
            <SheetTitle>Edit</SheetTitle>
          </SheetContent>
        </Sheet>
      </>,
    );
    act(() => void toast("Saved — Dine Out"));
    await screen.findByText("Saved — Dine Out");
    const list = () => document.querySelector("[data-sonner-toaster]") as HTMLElement;
    expect(list()).toHaveAttribute("data-y-position", "top");
    rerender(<Toaster />);
    act(() => void toast("Marked"));
    await screen.findByText("Marked");
    expect(list()).toHaveAttribute("data-y-position", "bottom");
    expect(list()).toHaveAttribute("data-x-position", "center");
  });

  // polish-4 #B: the Transactions page always renders its filter and edit sheets, closed.
  // fails_when=a closed sheet still moves the toast
  it("ignores sheets that are closed", async () => {
    render(
      <>
        <Toaster />
        <Sheet open={false} onOpenChange={vi.fn()}>
          <SheetContent side="bottom" aria-describedby={undefined}>
            <SheetTitle>Filter</SheetTitle>
          </SheetContent>
        </Sheet>
      </>,
    );
    act(() => void toast("Marked"));
    await screen.findByText("Marked");
    const list = document.querySelector("[data-sonner-toaster]") as HTMLElement;
    expect(list).toHaveAttribute("data-y-position", "bottom");
    expect(list).toHaveAttribute("data-x-position", "center");
  });

  // polish-4 #B: on tablet and desktop the edit sheet is a right-hand panel; a top toast covered
  // its title. fails_when=a toast shown while a right panel is open sits at the top or centre
  it("moves toasts to the bottom left while a right panel is open", async () => {
    render(
      <>
        <Toaster />
        <Sheet open onOpenChange={vi.fn()}>
          <SheetContent side="right" aria-describedby={undefined}>
            <SheetTitle>Edit</SheetTitle>
          </SheetContent>
        </Sheet>
      </>,
    );
    act(() => void toast("Saved — Dine Out"));
    await screen.findByText("Saved — Dine Out");
    const list = document.querySelector("[data-sonner-toaster]") as HTMLElement;
    expect(list).toHaveAttribute("data-y-position", "bottom");
    expect(list).toHaveAttribute("data-x-position", "left");
  });
});

// Issue #169: toasts were white on a dark page. fails_when=sonner keeps its light theme or its
// own white background in dark mode
describe("Toaster in dark mode", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("follows the system theme and the app's palette", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: q === "(prefers-color-scheme: dark)",
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    }));
    render(<Toaster />);
    act(() => void toast("Marked as regular"));
    await screen.findByText("Marked as regular");
    const list = document.querySelector("[data-sonner-toaster]") as HTMLElement;
    expect(list).toHaveAttribute("data-sonner-theme", "dark");
    expect(list.style.getPropertyValue("--normal-bg")).toBe("var(--popover)");
    expect(list.style.getPropertyValue("--normal-text")).toBe("var(--popover-foreground)");
  });
});
