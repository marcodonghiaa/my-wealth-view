import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// Lets you give a transaction your own name (e.g. a transfer to a friend that is really a
// subscription). An empty name goes back to the one the bank sent.
export function NameEditor({
  name,
  onSave,
  saving,
}: {
  name: string | null;
  onSave: (name: string | null) => void;
  saving: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState(name ?? "");

  function save() {
    const next = input.trim();
    setOpen(false);
    if (next === (name ?? "")) return;
    onSave(next === "" ? null : next);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setInput(name ?? "");
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Rename ${name ?? "transaction"}`}
          disabled={saving}
          className="max-w-full cursor-pointer truncate text-left font-medium text-foreground decoration-dotted underline-offset-4 hover:underline disabled:opacity-60"
        >
          {name ?? "—"}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 space-y-2.5 p-3">
        <label className="block text-xs font-medium text-muted-foreground">
          Name
          <input
            type="text"
            value={input}
            maxLength={100}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            className="mt-1 w-full rounded-lg border bg-background px-2.5 py-1.5 text-sm text-foreground"
          />
        </label>
        <p className="text-xs text-muted-foreground">Leave empty to use the bank's name.</p>
        <button
          type="button"
          onClick={save}
          className="inline-flex min-h-9 w-full cursor-pointer items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"
        >
          Save
        </button>
      </PopoverContent>
    </Popover>
  );
}
