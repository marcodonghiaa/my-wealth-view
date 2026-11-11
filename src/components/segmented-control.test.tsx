import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SegmentedControl } from "./segmented-control";

const options = [
  { value: "EUR", label: "EUR" },
  { value: "USD", label: "USD" },
  { value: "GBP", label: "GBP" },
];

describe("SegmentedControl", () => {
  it("exposes a labelled radio group with the current value checked", () => {
    render(<SegmentedControl label="Currency" options={options} value="USD" onChange={() => {}} />);
    expect(screen.getByRole("radiogroup", { name: "Currency" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "USD" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "EUR" })).not.toBeChecked();
  });

  it("calls onChange with the tapped option", async () => {
    const onChange = vi.fn();
    render(<SegmentedControl label="Currency" options={options} value="EUR" onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: "GBP" }));
    expect(onChange).toHaveBeenCalledWith("GBP");
  });

  it("moves selection with the arrow keys", async () => {
    const onChange = vi.fn();
    render(<SegmentedControl label="Currency" options={options} value="EUR" onChange={onChange} />);
    screen.getByRole("radio", { name: "EUR" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledWith("USD");
  });
});

// Polish pass 4 #19: radio groups also answer Up/Down and Home/End.
describe("SegmentedControl radio keys", () => {
  it("moves with Up/Down and jumps with Home/End", () => {
    render(<Harness />);
    const first = screen.getByRole("radio", { name: "EUR" });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowDown" });
    expect(screen.getByRole("radio", { name: "USD" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(screen.getByRole("radio", { name: "GBP" })).toBeChecked();
    fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
    expect(screen.getByRole("radio", { name: "USD" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    expect(screen.getByRole("radio", { name: "EUR" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "EUR" })).toHaveFocus();
  });
});

function Harness() {
  const [value, setValue] = useState("EUR");
  return <SegmentedControl label="Currency" value={value} onChange={setValue} options={options} />;
}

// Regression: arrow keys changed the value but focus stayed on a button that left the tab order.
describe("SegmentedControl focus", () => {
  it("moves focus with the selection on arrow keys", () => {
    render(<Harness />);
    const first = screen.getByRole("radio", { name: "EUR" });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(screen.getByRole("radio", { name: "USD" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
    fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
    expect(screen.getByRole("radio", { name: "GBP" })).toHaveFocus();
  });
});
