import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatAmountPlain, formatMoney, type TransactionRow } from "@/lib/transactions";
import { evenShare, joinNames, parseNames } from "@/lib/splits";
import { parseOwed } from "@/lib/account-types";

const QUICK_SPLITS = [2, 3, 4];

const pill = (on: boolean) =>
  `inline-flex min-h-9 items-center rounded-sm border px-3 text-sm transition-colors ${
    on
      ? "border-primary bg-primary text-primary-foreground"
      : "bg-background text-foreground hover:bg-accent"
  }`;

// Lets you record that only part of a transaction was actually yours (e.g.
// you fronted a group flight booking) -- personal_amount is what counts
// toward your spend analytics, the rest shows on the Owed dashboard as a
// receivable from whoever owed_by names (Splitwise page, "From your transactions").
// contacts = names used on past splits, offered as pills; "+ New" adds one.
export function SplitEditor({
  tx,
  onSave,
  saving,
  contacts = [],
}: {
  tx: TransactionRow;
  onSave: (personalAmount: number | null, owedBy: string | null) => void;
  saving: boolean;
  contacts?: Array<string> | undefined;
}) {
  const [open, setOpen] = useState(false);
  const fullAmount = Math.abs(tx.amount ?? 0);
  const [shareInput, setShareInput] = useState(() => String(tx.personal_amount ?? fullAmount));
  const [shareError, setShareError] = useState(false);
  const [people, setPeople] = useState(() => parseNames(tx.owed_by));
  const [newName, setNewName] = useState<string | null>(null);

  const has = (name: string) => people.some((p) => p.toLowerCase() === name.toLowerCase());
  const toggle = (name: string) =>
    setPeople((prev) =>
      has(name) ? prev.filter((p) => p.toLowerCase() !== name.toLowerCase()) : [...prev, name],
    );
  const addNew = () => {
    const name = (newName ?? "").trim();
    if (name && !has(name)) setPeople((prev) => [...prev, name]);
    setNewName(null);
  };
  const shown = [
    ...contacts,
    ...people.filter((p) => !contacts.some((c) => c.toLowerCase() === p.toLowerCase())),
  ];

  const isSplit = tx.personal_amount != null && tx.personal_amount < fullAmount;
  const owed = isSplit ? fullAmount - (tx.personal_amount as number) : 0;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setShareInput(String(tx.personal_amount ?? fullAmount));
          setPeople(parseNames(tx.owed_by));
          setNewName(null);
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Split ${tx.creditor_name ?? "transaction"}`}
          disabled={saving}
          className="-m-2 inline-flex min-h-11 cursor-pointer items-center p-2 disabled:opacity-60"
        >
          {isSplit ? (
            <span className="inline-flex min-w-24 justify-center rounded-sm border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20">
              Split · owed {formatMoney(owed, tx.currency ?? "EUR")}
            </span>
          ) : (
            <span className="inline-flex min-w-24 justify-center rounded-sm border border-dashed px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent">
              Split…
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 space-y-2.5 p-3"
        // Escape while typing a new name cancels the name, not the whole popover.
        onEscapeKeyDown={(e) => {
          if (newName === null) return;
          e.preventDefault();
          setNewName(null);
        }}
      >
        <div>
          <label
            htmlFor="split-your-share-full-amount"
            className="mb-1 block text-xs font-medium text-muted-foreground"
          >
            Your share ({tx.currency ?? "EUR"}, full amount {formatAmountPlain(fullAmount)})
          </label>
          {/* Text, not number: a number box follows the browser's own decimal mark, which can
              differ from the format picked in Settings. 6.25 and 6,25 both work. */}
          <Input
            id="split-your-share-full-amount"
            type="text"
            inputMode="decimal"
            value={shareInput}
            onChange={(e) => {
              setShareInput(e.target.value);
              setShareError(false);
            }}
          />
          {shareError && (
            <p role="alert" className="mt-1 text-xs text-destructive">
              Enter an amount between 0 and {formatAmountPlain(fullAmount)}.
            </p>
          )}
          <div className="mt-1.5 flex gap-1.5" role="group" aria-label="Quick split">
            {QUICK_SPLITS.map((n) => (
              <button
                key={n}
                type="button"
                aria-label={`Split in ${n}`}
                onClick={() => setShareInput(String(evenShare(fullAmount, n)))}
                className={`${pill(parseOwed(shareInput) === evenShare(fullAmount, n))} flex-1 justify-center`}
              >
                ÷{n}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="mb-1 block text-xs font-medium text-muted-foreground">
            Owed by (optional)
          </span>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Owed by">
            {shown.map((name) => (
              <button
                key={name}
                type="button"
                aria-pressed={has(name)}
                onClick={() => toggle(name)}
                className={pill(has(name))}
              >
                {name}
              </button>
            ))}
            {newName === null ? (
              <button
                type="button"
                onClick={() => setNewName("")}
                className="inline-flex min-h-9 items-center rounded-sm border border-dashed px-3 text-sm text-muted-foreground transition-colors hover:bg-accent"
              >
                + New
              </button>
            ) : (
              <Input
                autoFocus
                type="text"
                aria-label="New contact name"
                placeholder="e.g. Luca M"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onBlur={addNew}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addNew();
                  }
                }}
                className="h-9 w-32 text-sm md:text-sm"
              />
            )}
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          {isSplit && (
            <Button
              variant="ghost"
              onClick={() => {
                setOpen(false);
                onSave(null, null);
              }}
              className="flex-1 px-3"
            >
              Clear
            </Button>
          )}
          <Button
            onClick={() => {
              const parsed = parseOwed(shareInput);
              if (parsed == null || parsed > fullAmount) {
                setShareError(true);
                return;
              }
              setOpen(false);
              // Full amount = same as unset, keeps the "NULL means whole
              // thing is mine" convention the schema/views rely on.
              onSave(
                parsed === fullAmount ? null : parsed,
                parsed === fullAmount ? null : joinNames(people),
              );
            }}
            className="flex-1 px-3"
          >
            Save
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
