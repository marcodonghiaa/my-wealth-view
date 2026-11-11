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
    expect(screen.getByRole("combobox", { name: "Number and date format" })).toHaveValue("");
    // polish-4 #7: a real minus, like the transaction list.
    expect(screen.getByText("−€1,234.50")).toBeInTheDocument();
    expect(screen.getByText("3 Mar 2026")).toBeInTheDocument();
  });

  it("polish-4 #8 says Automatic follows the browser, and only a picked format is saved", () => {
    const { unmount } = render(<FormatsSection reload={() => {}} />);
    expect(screen.getByText(/Follows your browser \(English \(UK\)\)/)).toBeInTheDocument();
    expect(screen.queryByText(/Saved on this device/)).toBeNull();
    unmount();
    setLocaleOverride("de-DE");
    render(<FormatsSection reload={() => {}} />);
    expect(screen.getByText(/Saved on this device/)).toBeInTheDocument();
  });

  it("polish-4 #11 lands back on the menu after the reload a change causes", () => {
    window.location.hash = "#formats";
    try {
      render(<FormatsSection reload={() => {}} />);
      expect(screen.getByRole("combobox", { name: "Number and date format" })).toHaveFocus();
    } finally {
      window.location.hash = "";
    }
  });

  it("saves the choice and reloads so every figure uses it", () => {
    const reload = vi.fn();
    render(<FormatsSection reload={reload} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Number and date format" }), {
      target: { value: "de-DE" },
    });
    expect(localeOverride()).toBe("de-DE");
    expect(reload).toHaveBeenCalledOnce();
  });

  it("clears the choice when set back to automatic", () => {
    setLocaleOverride("it-IT");
    render(<FormatsSection reload={() => {}} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Number and date format" }), {
      target: { value: "" },
    });
    expect(localeOverride()).toBe("");
  });

  it("says so and does not reload when the browser blocks storage", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    const reload = vi.fn();
    render(<FormatsSection reload={reload} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Number and date format" }), {
      target: { value: "de-DE" },
    });
    expect(screen.getByRole("alert")).toHaveTextContent(/Couldn't save/);
    expect(reload).not.toHaveBeenCalled();
  });

  it("polish-3 #10 keeps showing the format in use when the new one can't be saved", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    render(<FormatsSection reload={() => {}} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Number and date format" }), {
      target: { value: "de-DE" },
    });
    expect(screen.getByRole("combobox", { name: "Number and date format" })).toHaveValue("");
  });
});
