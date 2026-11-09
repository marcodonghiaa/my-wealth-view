import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { latestDot } from "./value-chart";

describe("latestDot", () => {
  it("draws an Ember dot with a halo on the last point only", () => {
    const Dot = latestDot(2);
    const { container } = render(
      <svg>
        <Dot cx={10} cy={20} index={2} />
        <Dot cx={5} cy={5} index={1} />
      </svg>,
    );
    const circles = container.querySelectorAll("circle");
    expect(circles).toHaveLength(2);
    expect(circles[0]!.getAttribute("r")).toBe("6");
    expect(circles[0]!.getAttribute("fill-opacity")).toBe("0.2");
    expect(circles[1]!.getAttribute("r")).toBe("3");
  });
});
