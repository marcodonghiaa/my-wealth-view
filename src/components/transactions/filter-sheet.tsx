import { useRef, useState, type ReactNode } from "react";
import { ListFilter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { UNCATEGORIZED } from "@/lib/transactions";

export interface FilterSheetProps {
  category: string;
  onCategory: (category: string) => void;
  categories: { list: Array<string>; hasUncategorized: boolean };
  bank: string;
  onBank: (bank: string) => void;
  /** Banks seen this month; the bank filter shows only when there are two or more. */
  banks: Array<string>;
  tag: string;
  onTag: (tag: string) => void;
  /** Tags on this month's rows; the tag filter shows only when there is one. */
  tags: Array<string>;
  day: string;
  onDay: (day: string) => void;
  minDay: string;
  maxDay: string;
  /** Filters set (search not counted), shown on the button. */
  count: number;
  /** Rows the current filters leave, for the sheet's done button. */
  resultCount: number;
  onClear: () => void;
}

function Labeled({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="block px-1 text-[0.8125rem] font-medium text-muted-foreground"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

// Phone filters: one "Filter" button beside search opens a bottom sheet with category, day,
// bank and tag, so the list starts in the first viewport. Desktop keeps the inline fields.
export function FilterSheet(p: FilterSheetProps) {
  const [open, setOpen] = useState(false);
  // Clear disables itself once nothing is set; keep keyboard focus in the sheet (#164).
  const showRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Button
        variant="quiet"
        onClick={() => setOpen(true)}
        aria-label={p.count ? `Filter, ${p.count} active` : "Filter"}
        className="gap-1.5 px-3"
      >
        <ListFilter />
        Filter
        {p.count > 0 && (
          <span aria-hidden className="font-figure text-xs text-ember">
            {p.count}
          </span>
        )}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          aria-describedby={undefined}
          className="max-h-[88dvh] gap-0 overflow-y-auto rounded-t-xl border-0 bg-background p-0 pb-[env(safe-area-inset-bottom)] [&>button]:size-11"
        >
          <div aria-hidden className="mx-auto mt-2 h-1 w-9 rounded-full bg-muted-foreground/40" />
          <SheetHeader className="px-5 pt-3 pb-3 text-left">
            <SheetTitle className="text-xl">Filter</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 px-4 pb-4">
            <Labeled label="Category" htmlFor="filter-category">
              <Select
                id="filter-category"
                onGround
                value={p.category}
                onChange={(e) => p.onCategory(e.target.value)}
                className="px-4"
              >
                <option value="all">All categories</option>
                {p.categories.hasUncategorized && (
                  <option value={UNCATEGORIZED}>Uncategorized</option>
                )}
                {p.categories.list.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Labeled>
            <Labeled label="Day" htmlFor="filter-day">
              <Input
                id="filter-day"
                onGround
                type="date"
                value={p.day}
                min={p.minDay}
                max={p.maxDay}
                onChange={(e) => p.onDay(e.target.value)}
                className="px-4"
              />
            </Labeled>
            {p.banks.length > 1 && (
              <Labeled label="Bank" htmlFor="filter-bank">
                <Select
                  id="filter-bank"
                  onGround
                  value={p.bank}
                  onChange={(e) => p.onBank(e.target.value)}
                  className="px-4"
                >
                  <option value="all">All banks</option>
                  {p.banks.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </Select>
              </Labeled>
            )}
            {p.tags.length > 0 && (
              <Labeled label="Tag" htmlFor="filter-tag">
                <Select
                  id="filter-tag"
                  onGround
                  value={p.tag}
                  onChange={(e) => p.onTag(e.target.value)}
                  className="px-4"
                >
                  <option value="">All tags</option>
                  {p.tags.map((t) => (
                    <option key={t} value={t}>
                      #{t}
                    </option>
                  ))}
                </Select>
              </Labeled>
            )}
            <div className="flex gap-3 pt-2">
              <Button
                variant="quiet"
                onClick={() => {
                  p.onClear();
                  showRef.current?.focus();
                }}
                disabled={p.count === 0}
                className="flex-1"
              >
                Clear
              </Button>
              <Button ref={showRef} onClick={() => setOpen(false)} className="flex-1">
                Show {p.resultCount} transaction{p.resultCount === 1 ? "" : "s"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
