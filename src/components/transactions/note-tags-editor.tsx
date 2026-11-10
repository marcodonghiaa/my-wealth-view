import { useEffect, useId, useState } from "react";
import { X } from "lucide-react";
import { fieldClass } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import {
  MAX_NOTE_LENGTH,
  MAX_TAG_LENGTH,
  MAX_TAGS,
  normalizeNote,
  normalizeTags,
} from "@/lib/transactions";

/** Free text about a transaction. Saved when the field loses focus, if it changed. */
export function NoteEditor({
  note,
  onSave,
  saving,
}: {
  note: string | null | undefined;
  onSave: (note: string | null) => void;
  saving: boolean;
}) {
  const [input, setInput] = useState(note ?? "");
  useEffect(() => setInput(note ?? ""), [note]);

  return (
    <textarea
      aria-label="Note"
      value={input}
      maxLength={MAX_NOTE_LENGTH}
      rows={2}
      disabled={saving}
      placeholder="Add a note"
      onChange={(e) => setInput(e.target.value)}
      onBlur={() => {
        const next = normalizeNote(input);
        if (next !== (note ?? null)) onSave(next);
      }}
      className={cn(fieldClass(), "h-auto min-h-11 resize-y py-2.5")}
    />
  );
}

/**
 * Tags as chips. Type one and press Enter (or a comma) to add it; tags used before are
 * suggested. Every add or remove saves at once.
 */
export function TagEditor({
  tags,
  onSave,
  saving,
  suggestions = [],
}: {
  tags: Array<string> | null | undefined;
  onSave: (tags: Array<string>) => void;
  saving: boolean;
  suggestions?: Array<string> | undefined;
}) {
  const listId = useId();
  const current = tags ?? [];
  const [input, setInput] = useState("");
  const full = current.length >= MAX_TAGS;

  function add() {
    const next = normalizeTags([...current, input]);
    setInput("");
    if (next.length !== current.length) onSave(next);
  }

  const offered = suggestions.filter(
    (s) => !current.some((t) => t.toLowerCase() === s.toLowerCase()),
  );

  return (
    <div className="space-y-2">
      {current.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
          {current.map((t) => (
            <li
              key={t}
              className="inline-flex items-center gap-1 rounded-sm bg-accent py-0.5 pr-0.5 pl-2 text-xs text-foreground"
            >
              {t}
              <button
                type="button"
                disabled={saving}
                aria-label={`Remove tag ${t}`}
                onClick={() => onSave(current.filter((x) => x !== t))}
                className="inline-flex size-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-background hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        aria-label="Add a tag"
        list={listId}
        value={input}
        maxLength={MAX_TAG_LENGTH}
        disabled={saving || full}
        placeholder={full ? `Up to ${MAX_TAGS} tags` : "Add a tag"}
        onChange={(e) => {
          // A comma ends a tag, like Enter.
          if (e.target.value.endsWith(",")) {
            setInput(e.target.value.slice(0, -1));
            return;
          }
          setInput(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          }
        }}
        onBlur={() => input.trim() && add()}
        className={fieldClass()}
      />
      <datalist id={listId}>
        {offered.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}
