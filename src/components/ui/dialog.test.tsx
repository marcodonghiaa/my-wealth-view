import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
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
    const href = window.location.href;
    render(<Page />);
    fireEvent.click(screen.getByText("Open"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(window.history.length).toBe(before + 1);
    await popTo({ page: 1 });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(window.location.href).toBe(href);
  });

  it("a dialog that refuses to close (mid-import) stays open on Back", async () => {
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
    await popTo({ page: 1 });
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
