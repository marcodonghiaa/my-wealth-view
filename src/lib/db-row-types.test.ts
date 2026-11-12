import { describe, expectTypeOf, it } from "vitest";
import type { Tables } from "@/integrations/supabase/types";
import type { ChargeTx } from "./recurring-calendar";
import type { IncomeTx } from "./regular-income";

// Polish 3 #6: the rows read from `transactions` take their types from the database, so a
// nullable column (account_uid) or a renamed one can't hide behind a hand-written type.
type Tx = Tables<"transactions">;

describe("row types", () => {
  it("match the transactions table", () => {
    expectTypeOf<ChargeTx>().toEqualTypeOf<
      Pick<
        Tx,
        | "account_uid"
        | "entry_reference"
        | "booking_date"
        | "merchant_key"
        | "amount"
        | "currency"
        | "transaction_type"
      >
    >();
    expectTypeOf<IncomeTx>().toEqualTypeOf<
      Pick<
        Tx,
        | "account_uid"
        | "entry_reference"
        | "booking_date"
        | "merchant_key"
        | "creditor_name"
        | "remittance_info"
        | "amount"
        | "currency"
      >
    >();
  });
});
