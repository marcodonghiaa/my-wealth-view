import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
