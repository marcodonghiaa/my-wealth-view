import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

describe("NoteEditor draft", () => {
  // protects=a failed save never wipes what the user typed; fails_when=the rollback resets the field
  it("keeps the typed note when a save fails and the old note comes back", () => {
    const onSave = vi.fn();
    const { rerender } = render(<NoteEditor note="old" onSave={onSave} saving={false} />);
    const field = screen.getByLabelText("Note");
    fireEvent.change(field, { target: { value: "new" } });
    fireEvent.blur(field);
    rerender(<NoteEditor note="new" onSave={onSave} saving={true} />);
    rerender(<NoteEditor note="old" onSave={onSave} saving={false} />);
    expect(field).toHaveValue("new");
    fireEvent.blur(field);
    expect(onSave).toHaveBeenCalledTimes(2);
  });
});

describe("closing the sheet", () => {
  // protects=Esc or X never loses an unsaved note or half-typed tag; fails_when=only blur saves
  it("saves a changed note once when the editor goes away without a blur", () => {
    const onSave = vi.fn();
    const { unmount } = render(<NoteEditor note="old" onSave={onSave} saving={false} />);
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "new" } });
    unmount();
    expect(onSave).toHaveBeenCalledWith("new");
  });

  // fails_when=closing the sheet saves the old text over a newer note the user never touched
  it("shows a newer note that arrives while untouched, and doesn't save on close", () => {
    const onSave = vi.fn();
    const { rerender, unmount } = render(<NoteEditor note="old" onSave={onSave} saving={false} />);
    rerender(<NoteEditor note="newer" onSave={onSave} saving={false} />);
    expect(screen.getByLabelText("Note")).toHaveValue("newer");
    unmount();
    expect(onSave).not.toHaveBeenCalled();
  });

  // polish-3 #8: fails_when=the note can be edited while its save runs
  it("locks the note while it saves", () => {
    render(<NoteEditor note="old" onSave={vi.fn()} saving={true} />);
    expect(screen.getByLabelText("Note")).toBeDisabled();
  });

  // polish-3 #3: fails_when=passing through the field rewrites a note stored in another form
  it("doesn't save on blur when nothing was typed", () => {
    const onSave = vi.fn();
    render(<NoteEditor note={"cafe\u0301 x\u00a0"} onSave={onSave} saving={false} />);
    fireEvent.blur(screen.getByLabelText("Note"));
    expect(onSave).not.toHaveBeenCalled();
  });

  // polish-3 #2: fails_when=a note whose save failed is dropped when the sheet closes
  it("retries a failed note when the editor goes away", () => {
    const onSave = vi.fn();
    const { rerender, unmount } = render(<NoteEditor note="old" onSave={onSave} saving={false} />);
    const field = screen.getByLabelText("Note");
    fireEvent.change(field, { target: { value: "oldx" } });
    fireEvent.blur(field);
    rerender(<NoteEditor note="oldx" onSave={onSave} saving={true} />);
    rerender(<NoteEditor note="old" onSave={onSave} saving={false} />);
    unmount();
    expect(onSave.mock.calls).toEqual([["oldx"], ["oldx"]]);
  });

  it("does not save twice when blur already saved", () => {
    const onSave = vi.fn();
    const { unmount } = render(<NoteEditor note="old" onSave={onSave} saving={false} />);
    const field = screen.getByLabelText("Note");
    fireEvent.change(field, { target: { value: "new" } });
    fireEvent.blur(field);
    unmount();
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("adds a half-typed tag when the editor goes away", () => {
    const onSave = vi.fn();
    const { unmount } = render(<TagEditor tags={["trip"]} onSave={onSave} saving={false} />);
    fireEvent.change(screen.getByLabelText("Add a tag"), { target: { value: "food" } });
    unmount();
    expect(onSave).toHaveBeenCalledWith(["trip", "food"]);
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

  // polish-3 #1: fails_when=the field locks while a tag saves (keys typed meanwhile are lost),
  // or the next tag is built on the list from before the save
  it("keeps taking tags while one is saving", async () => {
    const onSave = vi.fn();
    const tags = ["trip"]; // the same list until the save's update reaches the cache
    const { rerender } = render(<TagEditor tags={tags} onSave={onSave} saving={false} />);
    const input = screen.getByLabelText("Add a tag");
    await userEvent.type(input, "a,");
    rerender(<TagEditor tags={tags} onSave={onSave} saving={true} />);
    expect(input).toBeEnabled();
    await userEvent.type(input, "b,");
    expect(onSave.mock.calls).toEqual([[["trip", "a"]], [["trip", "a", "b"]]]);
  });

  // polish-3 #8: while a save runs, the remove buttons wait; the add field stays open (#1)
  it("disables removing while a save runs", () => {
    render(<TagEditor tags={["trip"]} onSave={vi.fn()} saving={true} />);
    expect(screen.getByRole("button", { name: "Remove tag trip" })).toBeDisabled();
    expect(screen.getByLabelText("Add a tag")).toBeEnabled();
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

  // polish-4 #1: fails_when=a long tag widens its chip past a phone sheet and pushes × out of reach
  it("cuts a long tag short, keeps it whole on hover, and never squeezes out its ×", () => {
    const long = "w".repeat(40);
    render(<TagEditor tags={[long]} onSave={vi.fn()} saving={false} />);
    const text = screen.getByText(long);
    expect(text).toHaveClass("truncate");
    expect(text).toHaveAttribute("title", long);
    expect(text.closest("li")).toHaveClass("max-w-full", "min-w-0");
    expect(screen.getByRole("button", { name: `Remove tag ${long}` })).toHaveClass("shrink-0");
  });

  it("stops at 20 tags", () => {
    const tags = Array.from({ length: 20 }, (_, i) => `t${i}`);
    render(<TagEditor tags={tags} onSave={vi.fn()} saving={false} />);
    expect(screen.getByLabelText("Add a tag")).toBeDisabled();
  });

  // polish-4 #3: fails_when=removing a chip leaves keyboard focus on nothing
  it("moves focus to the tag field after removing a tag", async () => {
    render(<TagEditor tags={["trip", "work"]} onSave={vi.fn()} saving={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove tag trip" }));
    expect(screen.getByLabelText("Add a tag")).toHaveFocus();
  });
});

// polish-1 #11: a comma always ends a tag, also when it arrives without a key event (Android
// keyboards) or inside pasted text; a tag never holds a comma (the export joins tags with ", ").
describe("TagEditor commas", () => {
  it("adds the tag when a comma arrives through typing alone", () => {
    const onSave = vi.fn();
    render(<TagEditor tags={[]} onSave={onSave} saving={false} />);
    const input = screen.getByLabelText("Add a tag");
    fireEvent.change(input, { target: { value: "work," } });
    expect(onSave).toHaveBeenLastCalledWith(["work"]);
    expect(input).toHaveValue("");
  });

  it("splits pasted text at commas", () => {
    const onSave = vi.fn();
    render(<TagEditor tags={["trip"]} onSave={onSave} saving={false} />);
    const input = screen.getByLabelText("Add a tag");
    fireEvent.change(input, { target: { value: "work, food" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSave).toHaveBeenLastCalledWith(["trip", "work", "food"]);
  });
});

// polish-1 #5: typing "trip" when "Trip" is already used reuses "Trip".
describe("TagEditor reuses an existing spelling", () => {
  it("takes the suggestion's spelling when only case differs", () => {
    const onSave = vi.fn();
    render(<TagEditor tags={[]} onSave={onSave} saving={false} suggestions={["Trip"]} />);
    const input = screen.getByLabelText("Add a tag");
    fireEvent.change(input, { target: { value: "trip" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSave).toHaveBeenLastCalledWith(["Trip"]);
  });
});
