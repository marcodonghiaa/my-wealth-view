import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DemoBadge } from "./demo-badge";
import { enterDemoMode, exitDemoMode } from "@/lib/demo/mode";

describe("DemoBadge", () => {
  afterEach(() => exitDemoMode());

  it("is hidden outside demo mode", () => {
    render(<DemoBadge />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("says the data is fake", () => {
    enterDemoMode();
    render(<DemoBadge />);
    expect(screen.getByRole("status").textContent).toBe("Demo, fake data");
  });

  // Regression: at 320px the full badge overlapped the centred "MyFinances" title in the
  // mobile top bar. jsdom has no layout, so check that narrow screens show only "Demo".
  it("shortens to Demo under 360px but keeps the full text for screen readers", () => {
    enterDemoMode();
    render(<DemoBadge />);
    const rest = screen.getByText(", fake data");
    expect(rest.className).toContain("max-[359px]:sr-only");
    expect(rest.className).not.toMatch(/(^|\s)hidden/);
  });
});
