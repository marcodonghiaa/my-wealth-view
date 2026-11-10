import {
  ArrowDownLeft,
  ArrowLeftRight,
  CircleDashed,
  Clapperboard,
  HeartPulse,
  House,
  Landmark,
  Shapes,
  ShoppingBag,
  ShoppingCart,
  Ticket,
  TramFront,
  UtensilsCrossed,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { categoryCode, categoryColor } from "@/lib/categories";

const ICONS: Record<string, LucideIcon> = {
  Shopping: ShoppingBag,
  Entertainment: Clapperboard,
  Groceries: ShoppingCart,
  "Dine Out": UtensilsCrossed,
  Services: Wrench,
  Housing: House,
  Transports: TramFront,
  Experiences: Ticket,
  Income: ArrowDownLeft,
  Health: HeartPulse,
  Transfer: ArrowLeftRight,
  Taxes: Landmark,
  Others: Shapes,
};

/**
 * 40px circle with the category's line icon, tinted in the category colour, so rows scan by
 * what the money went on.
 * Your own categories show their initial; no category shows a dashed circle.
 */
export function CategoryAvatar({ category }: { category: string | null }) {
  const missing = !category || category === "Uncategorized";
  const Icon = missing ? CircleDashed : ICONS[category];
  const color = categoryColor(category);
  return (
    <span
      aria-hidden
      data-category={category ?? ""}
      className="flex size-10 shrink-0 items-center justify-center rounded-full"
      style={{ color, backgroundColor: `color-mix(in oklab, ${color} 16%, var(--color-card))` }}
    >
      {Icon ? (
        <Icon className="size-[18px]" strokeWidth={1.75} />
      ) : (
        <span className="text-[0.9375rem] font-semibold">{categoryCode(category).charAt(0)}</span>
      )}
    </span>
  );
}
