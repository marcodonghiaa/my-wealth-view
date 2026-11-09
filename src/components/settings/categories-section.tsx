import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ALWAYS_SHOWN, CATEGORIES, categoryColor } from "@/lib/categories";
import { CATEGORIES_KEY, useCategories } from "@/lib/use-categories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { GroupedList } from "@/components/ui/grouped-list";

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
            <Input
              aria-label="New category"
              placeholder="New category"
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 px-4"
            />
            <Button type="submit" disabled={busy}>
              Add
            </Button>
          </form>
          {error && (
            <p role="alert" className="text-sm text-negative">
              {error}
            </p>
          )}
          <GroupedList>
            <ul className="divide-y divide-hairline">
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
                      <Button
                        variant="ghost"
                        className="px-3"
                        disabled={busy}
                        onClick={() => remove.mutate(c)}
                      >
                        Delete
                      </Button>
                    ) : ALWAYS_SHOWN.includes(c) ? null : isHidden ? (
                      <Button
                        variant="ghost"
                        className="px-3"
                        disabled={busy}
                        onClick={() => remove.mutate(c)}
                      >
                        Show
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        className="px-3"
                        disabled={busy}
                        onClick={() => save.mutate({ name: c, hidden: true })}
                      >
                        Hide
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </GroupedList>
        </div>
      )}
    </section>
  );
}
