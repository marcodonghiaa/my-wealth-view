import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AmountEditor } from "./amount-editor";

const openEditor = (onSave = vi.fn()) => {
  render(<AmountEditor amount={45.5} currency="EUR" onSave={onSave} saving={false} />);
  fireEvent.click(screen.getByRole("button", { name: "Change amount" }));
  return onSave;
};

describe("AmountEditor", () => {
  it("saves a new amount typed with a comma", () => {
    const onSave = openEditor();
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "40,25" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(40.25);
  });

  it("refuses zero or text, and does not save the same amount again", () => {
    const onSave = openEditor();
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/above zero/i);
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "45.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("left-open #1 says why an unclear number like 1,250 is refused", () => {
    const onSave = openEditor();
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "1,250" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent('"1,250" could mean 1250 or 1.25');
    expect(onSave).not.toHaveBeenCalled();
  });
});
