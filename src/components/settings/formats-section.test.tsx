import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { localeOverride, setLocaleOverride } from "@/lib/locale";
import { FormatsSection } from "./formats-section";

afterEach(() => setLocaleOverride(""));

describe("FormatsSection", () => {
  it("follows the browser by default and shows an example", () => {
    render(<FormatsSection reload={() => {}} />);
    expect(screen.getByLabelText("Format")).toHaveValue("");
    expect(screen.getByText("-€1,234.50")).toBeInTheDocument();
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
});
