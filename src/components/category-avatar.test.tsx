import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { CategoryAvatar } from "./category-avatar";

describe("CategoryAvatar", () => {
  it("draws a line icon for a built-in category", () => {
    const { container } = render(<CategoryAvatar category="Groceries" />);
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.textContent).toBe("");
    // Tinted in the category's own colour (Groceries).
    expect((container.firstChild as HTMLElement).style.color).not.toBe("");
  });

  it("shows the initial for a custom category", () => {
    const { container } = render(<CategoryAvatar category="Pets" />);
    expect(container.querySelector("svg")).toBeNull();
    expect(container.textContent).toBe("P");
  });

  it("shows a dashed circle when there is no category", () => {
    for (const c of [null, "Uncategorized"]) {
      const { container, unmount } = render(<CategoryAvatar category={c} />);
      expect(container.querySelector("svg")).not.toBeNull();
      unmount();
    }
  });
});
