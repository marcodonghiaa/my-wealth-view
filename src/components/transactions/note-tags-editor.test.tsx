import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NoteEditor, TagEditor } from "./note-tags-editor";

// protects=notes and tags save what the user typed, cleaned, and only when something changed;
// fails_when=blur saves an unchanged note, a duplicate tag is saved, or removing a tag fails
describe("NoteEditor", () => {
  it("saves on blur only when the note changed, empty as null", () => {
    const onSave = vi.fn();
    render(<NoteEditor note="old" onSave={onSave} saving={false} />);
    const field = screen.getByLabelText("Note");
    fireEvent.blur(field);
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: "  new note " } });
    fireEvent.blur(field);
    expect(onSave).toHaveBeenLastCalledWith("new note");
    fireEvent.change(field, { target: { value: "  " } });
    fireEvent.blur(field);
    expect(onSave).toHaveBeenLastCalledWith(null);
  });
});

describe("TagEditor", () => {
  it("adds a tag on Enter and on comma, skipping repeats", () => {
    const onSave = vi.fn();
    render(<TagEditor tags={["trip"]} onSave={onSave} saving={false} />);
    const input = screen.getByLabelText("Add a tag");
    fireEvent.change(input, { target: { value: " work " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSave).toHaveBeenLastCalledWith(["trip", "work"]);
    fireEvent.change(input, { target: { value: "Trip" } });
    fireEvent.keyDown(input, { key: "," });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(input).toHaveValue("");
  });

  it("removes a tag", () => {
    const onSave = vi.fn();
    render(<TagEditor tags={["trip", "work"]} onSave={onSave} saving={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove tag trip" }));
    expect(onSave).toHaveBeenCalledWith(["work"]);
  });

  it("adds a half-typed tag on blur, and offers unused suggestions", () => {
    const onSave = vi.fn();
    const { container } = render(
      <TagEditor tags={["trip"]} onSave={onSave} saving={false} suggestions={["trip", "food"]} />,
    );
    const options = [...container.querySelectorAll("datalist option")].map((o) =>
      o.getAttribute("value"),
    );
    expect(options).toEqual(["food"]);
    const input = screen.getByLabelText("Add a tag");
    fireEvent.change(input, { target: { value: "food" } });
    fireEvent.blur(input);
    expect(onSave).toHaveBeenCalledWith(["trip", "food"]);
  });

  it("stops at 20 tags", () => {
    const tags = Array.from({ length: 20 }, (_, i) => `t${i}`);
    render(<TagEditor tags={tags} onSave={vi.fn()} saving={false} />);
    expect(screen.getByLabelText("Add a tag")).toBeDisabled();
  });
});
