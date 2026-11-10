// Shared by the Portfolio and Crypto pages and their add/edit controls.

export interface SnapshotValue {
  quantity: number; // current shares or amount, from the holding
  price: number | null; // price of the latest snapshot
  valueAtPrice: number | null; // snapshot value in the price's currency (value_native / value_usd)
  valueEur: number | null; // snapshot value in EUR
}

// The views pair the current quantity with the latest priced snapshot, so after an edit the value
// would lag until the next price sync. Rescale it to the new quantity at the snapshot's price and
// exchange rate instead.
export function currentValueEur({
  quantity,
  price,
  valueAtPrice,
  valueEur,
}: SnapshotValue): number {
  if (valueEur == null) return 0;
  if (price == null || !valueAtPrice) return valueEur;
  return valueEur * ((quantity * price) / valueAtPrice);
}

// The snapshot's price in EUR, at the same exchange rate the snapshot's value_eur used.
// Null when the snapshot has no price or no value to take the rate from.
export function priceEur({ price, valueAtPrice, valueEur }: Omit<SnapshotValue, "quantity">) {
  if (price == null || !valueAtPrice || valueEur == null) return null;
  return price * (valueEur / valueAtPrice);
}

// "3,5" and "3.5" both mean three and a half. Null for anything that isn't a positive number.
export function parseQuantity(input: string): number | null {
  const text = input.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) && value > 0 ? value : null;
}

// Coinbase amounts are overwritten by the sync, so only coins entered by hand can be edited.
export const isEditableCryptoSource = (source: string | null): boolean => source !== "Coinbase";
