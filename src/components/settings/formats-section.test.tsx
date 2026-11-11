import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { localeOverride, setLocaleOverride } from "@/lib/locale";
import { FormatsSection } from "./formats-section";

// Restore spies even when a test fails, so a blocked Storage can't leak into the next one.
afterEach(() => {
  vi.restoreAllMocks();
  setLocaleOverride("");
});

describe("FormatsSection", () => {
  it("follows the browser by default and shows an example", () => {
    render(<FormatsSection reload={() => {}} />);
    expect(screen.getByLabelText("Format")).toHaveValue("");
    // polish-4 #7: a real minus, like the transaction list.
    expect(screen.getByText("−€1,234.50")).toBeInTheDocument();
    expect(screen.getByText("3 Mar 2026")).toBeInTheDocument();
  });

  it("saves the choice and reloads so every figure uses it", () => {
    const reload = vi.fn();
    render(<FormatsSection reload={reload} />);
    fireEvent.change(screen.getByLabelText("Format"), {
      target: { value: "de-DE" },
    });
    expect(localeOverride()).toBe("de-DE");
    expect(reload).toHaveBeenCalledOnce();
  });

  it("clears the choice when set back to automatic", () => {
    setLocaleOverride("it-IT");
    render(<FormatsSection reload={() => {}} />);
    fireEvent.change(screen.getByLabelText("Format"), { target: { value: "" } });
    expect(localeOverride()).toBe("");
  });

  it("says so and does not reload when the browser blocks storage", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    const reload = vi.fn();
    render(<FormatsSection reload={reload} />);
    fireEvent.change(screen.getByLabelText("Format"), { target: { value: "de-DE" } });
    expect(screen.getByRole("alert")).toHaveTextContent(/Couldn't save/);
    expect(reload).not.toHaveBeenCalled();
  });

  it("polish-3 #10 keeps showing the format in use when the new one can't be saved", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    render(<FormatsSection reload={() => {}} />);
    fireEvent.change(screen.getByLabelText("Format"), { target: { value: "de-DE" } });
    expect(screen.getByLabelText("Format")).toHaveValue("");
  });
});
