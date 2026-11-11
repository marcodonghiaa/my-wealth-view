import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { fieldClass } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import {
  MAX_NOTE_LENGTH,
  MAX_TAG_LENGTH,
  MAX_TAGS,
  normalizeNote,
  normalizeTags,
  sameTag,
} from "@/lib/transactions";

/**
 * Free text about a transaction. Saved when the field loses focus, if it changed. Until the user
 * types, the field follows the note (a refetch can bring a newer one). Once they type, it keeps
 * their text: a failed save rolls the note back, and the next blur tries again. Closing the sheet
 * (Esc, X) can remove the field with no blur, so an edit not yet sent is saved then.
 */
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
  const [edited, setEdited] = useState(false);
  if (!edited && input !== (note ?? "")) setInput(note ?? "");
  // What blur last sent, so closing right after doesn't send it twice. Forgotten once the save
  // settles: a failed one rolled the note back, and closing then tries again.
  const sent = useRef<string | null>(null);
  useEffect(() => {
    if (!saving) sent.current = null;
  }, [saving]);
  const latest = useRef({ input, edited, note, onSave });
  latest.current = { input, edited, note, onSave };
  useEffect(
    () => () => {
      const { input, edited, note, onSave } = latest.current;
      const next = normalizeNote(input);
      if (edited && next !== (note ?? null) && next !== sent.current) onSave(next);
    },
    [],
  );

  return (
    <textarea
      aria-label="Note"
      value={input}
      maxLength={MAX_NOTE_LENGTH}
      rows={2}
      disabled={saving}
      placeholder="Add a note"
      onChange={(e) => {
        setEdited(true);
        setInput(e.target.value);
      }}
      onBlur={() => {
        const next = normalizeNote(input);
        if (edited && next !== (note ?? null)) {
          sent.current = next;
          onSave(next);
        }
      }}
      className={cn(fieldClass(), "h-auto min-h-11 resize-y py-2.5")}
    />
  );
}

/**
 * Tags as chips. Type one and press Enter (or a comma) to add it; tags used before are
 * suggested. Every add or remove saves at once. The field stays open while a save runs (locking it
 * would drop keys typed meanwhile and close a phone keyboard); the next tag builds on the list just
 * sent, and the saves go out one after another.
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
  // The list last sent, until the tags come back from the save (or roll back after a failure).
  const sent = useRef<Array<string> | null>(null);
  useEffect(() => {
    sent.current = null;
  }, [tags]);
  const current = sent.current ?? tags ?? [];
  const [input, setInput] = useState("");
  const full = current.length >= MAX_TAGS;

  function add(text = input) {
    // A new tag that only differs in case from one used before takes that spelling.
    const next = normalizeTags([...current, text]).map((t, i) =>
      i < current.length ? t : (suggestions.find((s) => sameTag(s, t)) ?? t),
    );
    setInput("");
    if (next.length !== current.length) save(next);
  }

  function save(next: Array<string>) {
    sent.current = next;
    onSave(next);
  }

  // Closing the sheet can remove the field with no blur: keep a half-typed tag then too.
  const latestAdd = useRef(() => {});
  latestAdd.current = () => {
    if (input.trim()) add();
  };
  useEffect(() => () => latestAdd.current(), []);

  const offered = suggestions.filter((s) => !current.some((t) => sameTag(t, s)));

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
                onClick={() => save(current.filter((x) => x !== t))}
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
        disabled={full}
        placeholder={full ? `Up to ${MAX_TAGS} tags` : "Add a tag"}
        onChange={(e) => {
          // A comma ends a tag, like Enter. Some phone keyboards send it with no key event.
          if (e.target.value.endsWith(",")) add(e.target.value);
          else setInput(e.target.value);
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
