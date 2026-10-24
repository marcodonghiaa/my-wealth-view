import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MadeWith } from "./made-with";
import { showBranding } from "@/lib/branding";

describe("MadeWith", () => {
  it("credits the project with a link to its repository by default", () => {
    expect(showBranding({})).toBe(true);
    render(<MadeWith />);
    const link = screen.getByRole("link", { name: /made with myfinances/i });
    expect(link.getAttribute("href")).toBe("https://github.com/marcodonghiaa/my-wealth-view");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("can be switched off by a self-hoster", () => {
    expect(showBranding({ VITE_HIDE_BRANDING: "true" })).toBe(false);
    expect(showBranding({ VITE_HIDE_BRANDING: "false" })).toBe(true);
  });
});
