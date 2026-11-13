import * as React from "react";

// Browser or phone Back closes an open sheet (#164) or dialog (#168) instead of leaving the page.
// Opening adds a history entry on the same address (the router's state kept, so it sees no new
// page); Back pops it. Closing another way (X, Esc, overlay) takes the entry out again, unless the
// app has already moved to another entry (a link inside), so that page is never undone.
// shortcut: Forward after Back re-enters the closed overlay's entry with nothing open, so the next
// Back looks like it does nothing. Re-opening it on Forward is not worth the code.

// How many sheets and dialogs are open: "Make a rule" from over one replaces its history entry.
let openOverlays = 0;
export const isOverlayOpen = () => openOverlays > 0;

export function useCloseOnBack(open: boolean, close: () => void) {
  const closeRef = React.useRef(close);
  closeRef.current = close;
  React.useEffect(() => {
    if (!open) return;
    const marker = Math.random().toString(36).slice(2);
    openOverlays++;
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
      openOverlays--;
      // After the router's queued navigation (a microtask) has landed. After Back the entry is
      // already gone, so this does nothing.
      setTimeout(() => {
        if (window.history.state?.__sheet === marker) window.history.back();
      });
    };
  }, [open]);
}
