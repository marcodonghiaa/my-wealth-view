import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CodeInput, fieldClass } from "./field";

// protects=phones offer the number pad and the code from SMS/password managers on every code field;
// fails_when=a code field drops the one-time-code hints or the shared look
describe("CodeInput", () => {
  it("is a required numeric one-time-code field with the form look by default", () => {
    render(<CodeInput aria-label="Code" />);
    const input = screen.getByLabelText("Code");
    expect(input).toBeRequired();
    expect(input).toHaveAttribute("inputmode", "numeric");
    expect(input).toHaveAttribute("autocomplete", "one-time-code");
    expect(input).toHaveAttribute("maxlength", "9");
    expect(input).toHaveAttribute("class", fieldClass());
  });

  it("takes a page's own look when given one", () => {
    render(<CodeInput aria-label="Code" className="big" />);
    expect(screen.getByLabelText("Code")).toHaveAttribute("class", "big");
  });
});
