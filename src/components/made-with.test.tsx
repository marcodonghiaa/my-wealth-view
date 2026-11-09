import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MadeWith } from "./made-with";

describe("MadeWith", () => {
  it("credits the project with a link to its site by default", () => {
    render(<MadeWith />);
    const link = screen.getByRole("link", { name: /made with alopex/i });
    expect(link.getAttribute("href")).toBe("https://alopex.finance");
    expect(link.getAttribute("rel")).toContain("noopener");
  });
});
