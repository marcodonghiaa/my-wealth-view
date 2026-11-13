import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "./dialog";

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
