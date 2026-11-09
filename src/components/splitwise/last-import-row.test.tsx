import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LastImportRow } from "./last-import-row";

afterEach(() => vi.useRealTimers());

describe("LastImportRow", () => {
  // protects=an import is never deleted by one stray tap; fails_when=the first tap undoes
  it("asks before undoing, and undoes on the second tap", () => {
    const onUndo = vi.fn();
    render(<LastImportRow count={4} pending={false} onUndo={onUndo} />);
    expect(screen.getByText("Last import · 4 expenses")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo import" }));
    expect(onUndo).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Tap again to undo" }));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("stops asking after a few seconds", () => {
    vi.useFakeTimers();
    render(<LastImportRow count={1} pending={false} onUndo={vi.fn()} />);
    expect(screen.getByText("Last import · 1 expense")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo import" }));
    act(() => vi.advanceTimersByTime(4000));
    expect(screen.getByRole("button", { name: "Undo import" })).toBeTruthy();
  });

  it("cannot be tapped while an undo is running", () => {
    render(<LastImportRow count={2} pending onUndo={vi.fn()} />);
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  });
});
