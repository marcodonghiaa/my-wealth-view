import * as React from "react";

// Our sheets and most dialogs open from state, not a Trigger, so Radix has nothing to refocus on
// close and focus fell to <body>. Remember what had focus at open (call from a layout effect of a
// child mounted only while open: before Radix moves focus in) and hand it back on close.
export function rememberOpener(opener: React.RefObject<Element | null>) {
  opener.current = document.activeElement;
}

export function returnFocus(
  opener: React.RefObject<Element | null>,
  onCloseAutoFocus?: (e: Event) => void,
) {
  return (e: Event) => {
    onCloseAutoFocus?.(e);
    const el = opener.current;
    // Nothing had focus (Safari doesn't focus a clicked button): leave Radix its own return to a
    // Trigger.
    if (e.defaultPrevented || !(el instanceof HTMLElement) || !el.isConnected) return;
    if (el === document.body) return;
    e.preventDefault();
    el.focus();
  };
}
