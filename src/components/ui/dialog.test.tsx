import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "./dialog";
import { Sheet, SheetContent, SheetTitle } from "./sheet";

// Issue #168: browser Back with a dialog open left the page (and lost what was typed).
// fails_when=Back leaves the dialog open
const popTo = (state: unknown) =>
  act(() => {
    window.history.replaceState(state, "");
    window.dispatchEvent(new PopStateEvent("popstate", { state }));
  });

function Controlled() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>Add transaction</DialogTitle>
        </DialogContent>
      </Dialog>
    </>
  );
}

function WithTrigger() {
  return (
    <Dialog>
      <DialogTrigger>Open</DialogTrigger>
      <DialogContent aria-describedby={undefined}>
        <DialogTitle>Trades</DialogTitle>
      </DialogContent>
    </Dialog>
  );
}

describe("Dialog and browser Back", () => {
  afterEach(() => window.history.replaceState(null, "", "/"));

  it.each([
    ["an open/onOpenChange dialog", Controlled],
    ["a dialog opened by its Trigger", WithTrigger],
  ])("Back closes %s and stays on the page", async (_, Page) => {
    window.history.replaceState({ page: 1 }, "");
    const before = window.history.length;
    render(<Page />);
    fireEvent.click(screen.getByText("Open"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(window.history.length).toBe(before + 1);
    await popTo({ page: 1 });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  // polish-3 F1: once a dialog has closed on Back, its entry must not be put back, or the next
  // Back seems to do nothing. fails_when=the re-push ignores that the dialog has gone
  it.each([
    ["an open/onOpenChange dialog", Controlled],
    ["a dialog opened by its Trigger", WithTrigger],
  ])("after Back closes %s, no history entry is added back", async (_, Page) => {
    window.history.replaceState({ page: 1 }, "");
    render(<Page />);
    fireEvent.click(screen.getByText("Open"));
    const push = vi.spyOn(window.history, "pushState");
    await popTo({ page: 1 });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await act(() => new Promise((r) => setTimeout(r, 0)));
    expect(push).not.toHaveBeenCalled();
    expect(window.history.state?.__sheet).toBeUndefined();
    push.mockRestore();
  });

  // polish-3 F7: closing with X takes the dialog's history entry back out.
  // fails_when=a closed dialog leaves its entry, so the next Back does nothing
  it("closing with X takes its history entry back out", async () => {
    window.history.replaceState({ page: 1 }, "");
    render(<WithTrigger />);
    fireEvent.click(screen.getByText("Open"));
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(back).toHaveBeenCalledTimes(1));
    back.mockRestore();
  });

  // polish-1 W2: a refused close (mid-import) must keep catching Back, not just the first one.
  // fails_when=the second Back leaves the page
  it("a dialog that refuses to close keeps catching Back", async () => {
    function Busy() {
      return (
        <Dialog open onOpenChange={() => {}}>
          <DialogContent aria-describedby={undefined}>
            <DialogTitle>Importing</DialogTitle>
          </DialogContent>
        </Dialog>
      );
    }
    window.history.replaceState({ page: 1 }, "");
    render(<Busy />);
    const tick = () => act(() => new Promise((r) => setTimeout(r, 0)));
    for (let i = 0; i < 2; i++) {
      await popTo({ page: 1 });
      await tick();
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      // Its entry is back on top, so this Back is caught too.
      expect(window.history.state.__sheet).toEqual(expect.any(String));
    }
  });
});

// polish-4 U1: a dialog opened from state (no DialogTrigger) left focus on <body> after Back or Esc,
// so a keyboard user started again from the top of the page. fails_when=focus stays on <body>
describe("Dialog focus", () => {
  it("gives focus back to the button that opened it after Back", async () => {
    render(<Controlled />);
    const open = screen.getByText("Open");
    open.focus();
    fireEvent.click(open);
    await screen.findByRole("dialog");
    popTo(null);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(open).toHaveFocus());
  });

  it("gives focus back after Esc too", async () => {
    render(<Controlled />);
    const open = screen.getByText("Open");
    open.focus();
    fireEvent.click(open);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(open).toHaveFocus());
  });

  // Re-audit of U1: Safari doesn't focus a button on click, so what had focus at open was <body>;
  // taking over from Radix then lost the Trigger's own focus return.
  // fails_when=a Trigger dialog opened by a click that didn't focus the Trigger ends on <body>
  it("still gives focus back to a Trigger that the click didn't focus", async () => {
    render(<WithTrigger />);
    const open = screen.getByText("Open");
    fireEvent.click(open);
    fireEvent.keyDown(await screen.findByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(open).toHaveFocus());
  });
});

// polish-5 W1: Splitwise import → Find in bank (a sheet over the dialog) → Back → Forward closed the
// import and lost the review: the dialog took the sheet's entry for a Back.
// fails_when=Forward onto a deeper overlay's entry closes the dialog under it
function Nested() {
  const [open, setOpen] = useState(false);
  const [inner, setInner] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>Import</DialogTitle>
          <button onClick={() => setInner(true)}>Find in bank</button>
        </DialogContent>
      </Dialog>
      <Sheet open={inner} onOpenChange={setInner}>
        <SheetContent aria-describedby={undefined}>
          <SheetTitle>Bank</SheetTitle>
        </SheetContent>
      </Sheet>
    </>
  );
}

describe("Dialog with a sheet over it", () => {
  afterEach(() => window.history.replaceState(null, "", "/"));

  it("Forward after Back onto the sheet's entry keeps the dialog open", async () => {
    window.history.replaceState({ page: 1 }, "");
    render(<Nested />);
    fireEvent.click(screen.getByText("Open"));
    const dialogEntry = window.history.state;
    fireEvent.click(screen.getByText("Find in bank"));
    const sheetEntry = window.history.state;
    await popTo(dialogEntry);
    await waitFor(() => expect(screen.queryByText("Bank")).not.toBeInTheDocument());
    await popTo(sheetEntry);
    await act(() => new Promise((r) => setTimeout(r, 0)));
    expect(screen.getByText("Import")).toBeInTheDocument();
  });
});
