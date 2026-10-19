import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NameEditor } from "./name-editor";

// protects=you can give a transaction your own name; fails_when=the saved name is untrimmed,
// an unchanged name is saved again, or clearing the field does not reset to the bank's name
describe("NameEditor", () => {
  it("saves the trimmed new name", async () => {
    const onSave = vi.fn();
    render(<NameEditor name="Alessio Peschiera" onSave={onSave} saving={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Rename Alessio Peschiera" }));
    const input = screen.getByRole("textbox", { name: "Name" });
    await userEvent.clear(input);
    await userEvent.type(input, "  Spotify ");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith("Spotify");
  });

  it("does not save an unchanged name", async () => {
    const onSave = vi.fn();
    render(<NameEditor name="Spotify" onSave={onSave} saving={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Rename Spotify" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("an empty name asks to reset to the bank's name", async () => {
    const onSave = vi.fn();
    render(<NameEditor name="Spotify" onSave={onSave} saving={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Rename Spotify" }));
    await userEvent.clear(screen.getByRole("textbox", { name: "Name" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(null);
  });
});
