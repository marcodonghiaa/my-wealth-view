import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CodeInput, fieldClass } from "./field";

// protects=phones offer the number pad and the code from SMS/password managers on every code field;
// fails_when=a code field drops the one-time-code hints or the shared look, or shows digits in sans
describe("CodeInput", () => {
  it("is a required numeric one-time-code field with the form look by default", () => {
    render(<CodeInput aria-label="Code" />);
    const input = screen.getByLabelText("Code");
    expect(input).toBeRequired();
    expect(input).toHaveAttribute("inputmode", "numeric");
    expect(input).toHaveAttribute("autocomplete", "one-time-code");
    expect(input).toHaveAttribute("maxlength", "9");
    expect(input.className).toBe(`${fieldClass()} font-mono tracking-[0.2em]`);
  });

  // fails_when=the sign-in pages paste their own copy of the large look, or a class drops the base
  it("has the sign-in pages' large look, and adds a page's classes to the base", () => {
    render(<CodeInput aria-label="Large" large />);
    expect(screen.getByLabelText("Large").className).toMatch(/text-center font-mono/);
    render(<CodeInput aria-label="Extra" className="mt-2" />);
    expect(screen.getByLabelText("Extra").className).toBe(`${fieldClass()} font-mono tracking-[0.2em] mt-2`);
  });
});
