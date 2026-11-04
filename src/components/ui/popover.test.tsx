import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

describe("PopoverContent", () => {
  // Regression: on phones the Rules "Category" list ran past the bottom of the
  // screen (popovers are position: fixed), so the last categories couldn't be
  // picked. jsdom has no layout, so check the cap itself: the content must be
  // no taller than the space Radix measured and scroll inside.
  it("caps its height to the available space and scrolls", () => {
    render(
      <Popover open>
        <PopoverTrigger>Open</PopoverTrigger>
        <PopoverContent>Long list</PopoverContent>
      </Popover>,
    );

    const content = screen.getByText("Long list");

    expect(content).toHaveClass("max-h-(--radix-popover-content-available-height)");
    expect(content).toHaveClass("overflow-y-auto");
  });
});
