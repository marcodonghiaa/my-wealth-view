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
});
