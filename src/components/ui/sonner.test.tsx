import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { toast } from "sonner";
import { Toaster } from "./sonner";

describe("Toaster", () => {
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
});
