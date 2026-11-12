import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

// Issue #164: browser Back with a sheet open closes the sheet instead of leaving the page.
function Page() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent aria-describedby={undefined}>
          <SheetTitle>Edit</SheetTitle>
        </SheetContent>
      </Sheet>
    </>
  );
}

const popTo = (state: unknown) =>
  act(() => {
    window.history.replaceState(state, "");
    window.dispatchEvent(new PopStateEvent("popstate", { state }));
  });

describe("Sheet and browser Back", () => {
  it("opening adds a history entry on the same address", () => {
    window.history.replaceState({ page: 1 }, "");
    const before = window.history.length;
    const href = window.location.href;
    render(<Page />);
    fireEvent.click(screen.getByText("Open"));
    expect(window.history.length).toBe(before + 1);
    expect(window.location.href).toBe(href);
    expect(window.history.state).toMatchObject({ page: 1 });
  });

  it("Back closes the sheet and stays on the page", async () => {
    window.history.replaceState({ page: 1 }, "");
    render(<Page />);
    fireEvent.click(screen.getByText("Open"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await popTo({ page: 1 });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("closing it another way takes its history entry back out", async () => {
    window.history.replaceState({ page: 1 }, "");
    render(<Page />);
    fireEvent.click(screen.getByText("Open"));
    const sheetState = window.history.state;
    let wentBack = false;
    const back = window.history.back;
    window.history.back = () => {
      wentBack = true;
    };
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(wentBack).toBe(true));
    window.history.back = back;
    expect(sheetState).not.toEqual({ page: 1 });
  });

  it("closing because the app navigated away leaves history alone", async () => {
    window.history.replaceState({ page: 1 }, "");
    render(<Page />);
    fireEvent.click(screen.getByText("Open"));
    let wentBack = false;
    const back = window.history.back;
    window.history.back = () => {
      wentBack = true;
    };
    // A link inside the sheet: the router pushes the new page, then the sheet closes.
    window.history.pushState({ page: 2 }, "", "/other");
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await new Promise((r) => setTimeout(r, 10));
    window.history.back = back;
    expect(wentBack).toBe(false);
  });
});
