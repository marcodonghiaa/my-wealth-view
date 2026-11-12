import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { MonthSwitcher } from "./month-switcher";

/** Steps 0..3, with an outside control that jumps to the last step (like a trend bar). */
function JumpHarness() {
  const [n, setN] = useState(1);
  return (
    <>
      <MonthSwitcher
        label={`Step ${n}`}
        onPrev={() => setN(n - 1)}
        onNext={() => setN(n + 1)}
        canGoPrev={n > 0}
        canGoNext={n < 3}
      />
      <span onClick={() => setN(3)}>last</span>
    </>
  );
}

/** Steps 0..2; Next turns off at 2, Previous at 0. */
function Harness() {
  const [n, setN] = useState(1);
  return (
    <MonthSwitcher
      label={`Step ${n}`}
      onPrev={() => setN(n - 1)}
      onNext={() => setN(n + 1)}
      canGoPrev={n > 0}
      canGoNext={n < 2}
    />
  );
}

// Polish 4 #4: an arrow that turns off under the keyboard hands focus to the other one, instead
// of dropping it to the top of the page.
describe("MonthSwitcher focus", () => {
  it("moves focus to Previous when Next turns off", () => {
    render(<Harness />);
    const next = screen.getByRole("button", { name: "Next month" });
    next.focus();
    fireEvent.click(next);
    expect(next).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous month" })).toHaveFocus();
  });

  it("moves focus to Next when Previous turns off", () => {
    render(<Harness />);
    const prev = screen.getByRole("button", { name: "Previous month" });
    prev.focus();
    fireEvent.click(prev);
    expect(prev).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next month" })).toHaveFocus();
  });

  // Polish 4 re-audit: a Next press mid-range left "pressed" set, so a later jump by another
  // control pulled focus to Previous (and scrolled the page up to it).
  it("leaves focus alone when another control turns Next off", () => {
    render(<JumpHarness />);
    const next = screen.getByRole("button", { name: "Next month" });
    next.focus();
    fireEvent.click(next);
    next.blur();
    fireEvent.click(screen.getByText("last"));
    expect(next).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous month" })).not.toHaveFocus();
  });
});
