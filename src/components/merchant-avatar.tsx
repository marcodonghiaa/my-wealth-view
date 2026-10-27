import { categoryColor } from "@/lib/categories";

/** Round initial on a wash of the category colour, so rows scan like a bank statement. */
export function MerchantAvatar({
  name,
  category,
}: {
  name: string | null;
  category: string | null;
}) {
  const initial = name?.trim().charAt(0).toUpperCase() || "·";
  return (
    <span
      aria-hidden
      className="flex size-10 shrink-0 items-center justify-center rounded-full text-[0.9375rem] font-semibold text-foreground"
      style={{
        backgroundColor: `color-mix(in oklab, ${categoryColor(category)} 22%, var(--color-card))`,
      }}
    >
      {initial}
    </span>
  );
}
