import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ALWAYS_SHOWN, CATEGORIES, categoryColor } from "@/lib/categories";
import { CATEGORIES_KEY, useCategories } from "@/lib/use-categories";

const BUTTON =
  "min-h-11 shrink-0 rounded-sm px-3 text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-50";

// Your categories: add your own, hide built-in ones you don't use. Pickers everywhere and the AI
// categorizer use the result. A hidden or deleted category stays on the transactions that have it.
export function CategoriesSection() {
  const queryClient = useQueryClient();
  const { list, settings, available, isPending } = useCategories();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const done = () => void queryClient.invalidateQueries({ queryKey: CATEGORIES_KEY });
  const onError = (err: Error) => toast.error("Couldn't save", { description: err.message });

  const save = useMutation({
    mutationFn: async (row: { name: string; hidden: boolean }) => {
      const { error } = await supabase.from("user_categories").upsert(row);
      if (error) throw new Error(error.message);
    },
    onSuccess: done,
    onError,
  });
  const remove = useMutation({
    mutationFn: async (category: string) => {
      const { error } = await supabase.from("user_categories").delete().eq("name", category);
      if (error) throw new Error(error.message);
    },
    onSuccess: done,
    onError,
  });

  const builtIn = CATEGORIES as ReadonlyArray<string>;
  const hidden = new Set(settings.filter((s) => s.hidden).map((s) => s.name));
  const own = list.filter((c) => !builtIn.includes(c));
  const busy = save.isPending || remove.isPending;

  function add(e: React.FormEvent) {
    e.preventDefault();
    const next = name.trim().replace(/\s+/g, " ");
    if (!next) return setError("Type a name.");
    if (next.length > 40) return setError("At most 40 characters.");
    const taken = [...builtIn, ...own].some((c) => c.toLowerCase() === next.toLowerCase());
    if (taken) return setError(`"${next}" is already in the list.`);
    setError(null);
    save.mutate({ name: next, hidden: false }, { onSuccess: () => setName("") });
  }

  return (
    <section id="categories" aria-labelledby="categories-heading" className="scroll-mt-6">
      <h2
        id="categories-heading"
        className="mb-4 text-[0.9375rem] font-medium text-muted-foreground"
      >
        Categories
      </h2>
      {!isPending && !available ? (
        <p className="text-sm text-muted-foreground">
          Your own categories need a database update first: run supabase db push --linked in the
          backend.
        </p>
      ) : (
        <div className="space-y-4">
          <form onSubmit={add} className="flex gap-2">
            <input
              aria-label="New category"
              placeholder="New category"
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
              className="h-11 min-w-0 flex-1 rounded-sm border bg-background px-4 text-base focus:ring-2 focus:ring-ring focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy}
              className="min-h-11 rounded-sm bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              Add
            </button>
          </form>
          {error && (
            <p role="alert" className="text-sm text-negative">
              {error}
            </p>
          )}
          <ul className="divide-y overflow-hidden rounded-2xl bg-card">
            {[...builtIn, ...own].map((c) => {
              const isOwn = !builtIn.includes(c);
              const isHidden = hidden.has(c);
              return (
                <li key={c} className="flex min-h-12 items-center gap-3 px-4 py-1">
                  <span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: categoryColor(c) }}
                  />
                  <span
                    className={`min-w-0 flex-1 truncate text-sm ${isHidden ? "text-muted-foreground line-through" : "text-foreground"}`}
                  >
                    {c}
                  </span>
                  {isOwn ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => remove.mutate(c)}
                      className={BUTTON}
                    >
                      Delete
                    </button>
                  ) : ALWAYS_SHOWN.includes(c) ? null : isHidden ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => remove.mutate(c)}
                      className={BUTTON}
                    >
                      Show
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => save.mutate({ name: c, hidden: true })}
                      className={BUTTON}
                    >
                      Hide
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
