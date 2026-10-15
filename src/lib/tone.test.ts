import { describe, expect, it } from "vitest";
import { toneOf } from "./tone";

describe("toneOf", () => {
  it("is positive above zero and negative below", () => {
    expect(toneOf(5)).toBe("positive");
    expect(toneOf(-5)).toBe("negative");
  });

  it("is neutral at exactly zero, so an empty total is not an alarm", () => {
    expect(toneOf(0)).toBe("neutral");
  });

  it("is neutral inside the dead band", () => {
    expect(toneOf(-0.0008, 0.005)).toBe("neutral");
    expect(toneOf(0.004, 0.005)).toBe("neutral");
  });

  it("keeps the sign colour once a move leaves the dead band", () => {
    expect(toneOf(-0.02, 0.005)).toBe("negative");
    expect(toneOf(0.02, 0.005)).toBe("positive");
  });
});
