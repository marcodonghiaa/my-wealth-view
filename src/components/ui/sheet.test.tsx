import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Sheet, SheetContent, SheetTitle } from "./sheet";

// polish-4 #13: a toast shown over an open sheet sits outside it. fails_when=touching the toast
// (to swipe it away) counts as a click outside and closes the sheet
describe("Sheet", () => {
  const renderSheet = (onOpenChange = vi.fn()) => {
    render(
      <>
        <ol data-sonner-toaster="">
          <li>Couldn't save note</li>
        </ol>
        <div>elsewhere</div>
        <Sheet open onOpenChange={onOpenChange}>
          <SheetContent aria-describedby={undefined}>
            <SheetTitle>Hotel</SheetTitle>
          </SheetContent>
        </Sheet>
      </>,
    );
    return onOpenChange;
  };
  // The sheet starts listening for outside clicks a tick after it opens.
  const tick = () => act(() => new Promise((r) => setTimeout(r, 0)));
  // jsdom's pointer events carry no pointerType, so Radix waits for the click that follows.
  const tap = (el: HTMLElement) => {
    fireEvent.pointerDown(el);
    fireEvent.click(el);
  };

  it("stays open when a toast is touched", async () => {
    const onOpenChange = renderSheet();
    await tick();
    tap(screen.getByText("Couldn't save note"));
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("still closes on a click elsewhere outside", async () => {
    const onOpenChange = renderSheet();
    await tick();
    tap(screen.getByText("elsewhere"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
