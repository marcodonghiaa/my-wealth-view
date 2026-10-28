import {
  ArrowLeftRight,
  CircleDashed,
  Clapperboard,
  HeartPulse,
  House,
  Receipt,
  Shapes,
  ShoppingBag,
  ShoppingCart,
  Ticket,
  TrainFront,
  UtensilsCrossed,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { categoryColor, type CATEGORIES } from "@/lib/categories";

const CATEGORY_ICONS: Record<(typeof CATEGORIES)[number], LucideIcon> = {
  Shopping: ShoppingBag,
  Entertainment: Clapperboard,
  Groceries: ShoppingCart,
  "Dine Out": UtensilsCrossed,
  Services: Wrench,
  Housing: House,
  Transports: TrainFront,
  Experiences: Ticket,
  Income: Wallet,
  Health: HeartPulse,
  Transfer: ArrowLeftRight,
  Taxes: Receipt,
  Others: Shapes,
};

/** Round category icon tinted in the category colour, so rows scan by what the money went on. */
export function CategoryAvatar({ category }: { category: string | null }) {
  const Icon = category
    ? ((CATEGORY_ICONS as Record<string, LucideIcon>)[category] ?? Shapes)
    : CircleDashed;
  const color = categoryColor(category);
  return (
    <span
      aria-hidden
      className="flex size-10 shrink-0 items-center justify-center rounded-full"
      style={{ color, backgroundColor: `color-mix(in oklab, ${color} 16%, var(--color-card))` }}
    >
      <Icon className="size-[1.125rem]" strokeWidth={2} />
    </span>
  );
}
