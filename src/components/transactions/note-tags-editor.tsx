import { useEffect, useId, useReducer, useRef, useState } from "react";
import { X } from "lucide-react";
import { fieldClass } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import {
  MAX_NOTE_LENGTH,
  MAX_TAG_LENGTH,
  MAX_TAGS,
  cutChars,
  normalizeNote,
  normalizeTags,
  sameTag,
} from "@/lib/transactions";

/**
 * Saves what's typed but not yet sent when the page goes away: hidden (tab or app switched, often
 * the last chance on a phone) or about to unload (reload, tab closed). `flush` sends it and says
 * whether it sent anything; then the browser asks before leaving, giving the save time to land.
 */
function useSaveOnLeave(flush: { current: () => boolean }) {
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flush.current();
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (flush.current()) e.preventDefault();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [flush]);
}

/**
 * Free text about a transaction. Saved when the field loses focus, if it changed. Until the user
 * types, the field follows the note (a refetch can bring a newer one). Once they type, it keeps
 * their text: a failed save rolls the note back, and the next blur tries again. Closing the sheet
 * (Esc, X) can remove the field with no blur, so an edit not yet sent is saved then.
 */
export function NoteEditor({
  id,
  note,
  onSave,
  saving,
}: {
  id?: string;
  note: string | null | undefined;
  /** May resolve to false when the save failed, so a failure seen at once still gets retried. */
  onSave: (note: string | null) => void | Promise<boolean>;
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
  // "Saved" for a moment after a save lands: on a phone the sheet hides the row it changed.
  const [saved, setSaved] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(timer);
  }, [saved]);
  // Sends an edit not yet sent (closing the sheet, leaving the page); true if it sent one.
  const flush = useRef<() => boolean>(() => false);
  flush.current = () => {
    const next = normalizeNote(input);
    if (!edited || next === (note ?? null) || next === sent.current) return false;
    sent.current = next;
    onSave(next);
    return true;
  };
  useEffect(() => () => void flush.current(), []);
  useSaveOnLeave(flush);

  return (
    <div className="space-y-1">
      <textarea
        id={id}
        value={input}
        rows={2}
        disabled={saving}
        placeholder="Add a note"
        onChange={(e) => {
          setEdited(true);
          setSaved(false);
          // Cut by characters, not maxLength's UTF-16 units: an emoji counts once, as in the DB.
          // A key typed into an already full note is ignored, like maxLength did (cutting would drop
          // the end); a longer paste is cut to the limit.
          const next = e.target.value;
          const wasFull = Array.from(input).length >= MAX_NOTE_LENGTH;
          if (!wasFull || Array.from(next).length <= MAX_NOTE_LENGTH)
            setInput(cutChars(next, MAX_NOTE_LENGTH));
        }}
        onBlur={() => {
          const next = normalizeNote(input);
          if (edited && next !== (note ?? null)) {
            sent.current = next;
            void Promise.resolve(onSave(next)).then((ok) => {
              if (ok === false && sent.current === next) sent.current = null;
              if (ok === true && mounted.current) setSaved(true);
            });
          }
        }}
        className={cn(fieldClass(), "h-auto min-h-11 resize-y py-2.5")}
      />
      <p aria-live="polite" className="min-h-4 text-xs text-muted-foreground">
        {saved && "Saved"}
      </p>
    </div>
  );
}

/**
 * Tags as chips. Type one and press Enter (or a comma) to add it; tags used before are
 * suggested. Every add or remove saves at once. The field stays open while a save runs (locking it
 * would drop keys typed meanwhile and close a phone keyboard); the next tag builds on the list just
 * sent, and the saves go out one after another.
 */
export function TagEditor({
  id,
  tags,
  onSave,
  saving,
  suggestions = [],
}: {
  /** For the field that adds a tag, so a heading can label it. */
  id?: string;
  tags: Array<string> | null | undefined;
  /** May resolve to false when the save failed: the chips then go back to the saved tags. */
  onSave: (tags: Array<string>) => void | Promise<boolean>;
  saving: boolean;
  suggestions?: Array<string> | undefined;
}) {
  const listId = useId();
  const field = useRef<HTMLInputElement>(null);
  const hintId = useId();
  // The list last sent, until the tags come back from the save (or roll back after a failure).
  const sent = useRef<Array<string> | null>(null);
  useEffect(() => {
    sent.current = null;
  }, [tags]);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const current = sent.current ?? tags ?? [];
  const [input, setInput] = useState("");
  // Read out by screen readers: the chips change silently otherwise.
  const [announce, setAnnounce] = useState("");
  const full = current.length >= MAX_TAGS;

  function add(text = input) {
    // A new tag that only differs in case from one used before takes that spelling.
    const next = normalizeTags([...current, text]).map((t, i) =>
      i < current.length ? t : (suggestions.find((s) => sameTag(s, t)) ?? t),
    );
    setInput("");
    if (next.length !== current.length) {
      save(next);
      setAnnounce(`Added tag ${next.slice(current.length).join(", ")}`);
    }
  }

  function save(next: Array<string>) {
    sent.current = next;
    // A failure can roll back before this field ever shows the save as pending, leaving `tags`
    // unchanged: forget the list sent, or its chips would stay.
    void Promise.resolve(onSave(next)).then((ok) => {
      if (ok === false && sent.current === next) {
        sent.current = null;
        rerender();
      }
    });
  }

  // Closing the sheet or leaving the page can come with no blur: keep a half-typed tag then too.
  const flush = useRef<() => boolean>(() => false);
  flush.current = () => {
    if (!input.trim()) return false;
    add();
    return true;
  };
  useEffect(() => () => void flush.current(), []);
  useSaveOnLeave(flush);

  const offered = suggestions.filter((s) => !current.some((t) => sameTag(t, s)));

  return (
    <div className="space-y-2">
      {current.length > 0 && (
        <ul className="flex flex-wrap gap-x-2.5 gap-y-2" aria-label="Tags">
          {current.map((t) => (
            <li
              key={t}
              className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-sm bg-accent py-0.5 pr-0.5 pl-2 text-xs text-foreground"
            >
              <span className="truncate" title={t}>
                {t}
              </span>
              <button
                type="button"
                disabled={saving}
                aria-label={`Remove tag ${t}`}
                onClick={() => {
                  save(current.filter((x) => x !== t));
                  setAnnounce(`Removed tag ${t}`);
                  // The chip and its button go away: keep keyboard focus in the editor.
                  field.current?.focus();
                }}
                className="relative inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-background hover:text-foreground after:absolute after:-inset-2.5 after:content-['']"
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        ref={field}
        id={id}
        list={listId}
        value={input}
        // Full: read-only, not disabled, so focus stays here instead of falling out of the sheet.
        readOnly={full}
        aria-disabled={full || undefined}
        aria-describedby={full ? hintId : undefined}
        placeholder="Add a tag"
        onChange={(e) => {
          // A comma ends a tag, like Enter. Some phone keyboards send it with no key event.
          if (e.target.value.endsWith(",")) add(e.target.value);
          // One tag is cut at 40 characters (an emoji counts once); pasted lists split at commas.
          else
            setInput(
              e.target.value.includes(",")
                ? e.target.value
                : cutChars(e.target.value, MAX_TAG_LENGTH),
            );
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          }
        }}
        onBlur={() => input.trim() && add()}
        // Suggestions still drop down; Chrome's ▼ would make the field look like a select.
        className={cn(fieldClass(), "[&::-webkit-calendar-picker-indicator]:hidden!")}
      />
      {full && (
        <p id={hintId} className="text-xs text-muted-foreground">
          Up to {MAX_TAGS} tags. Remove one to add another.
        </p>
      )}
      <p role="status" className="sr-only">
        {announce}
      </p>
      <datalist id={listId}>
        {offered.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}
