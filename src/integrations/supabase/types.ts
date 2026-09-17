export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          consent_valid_until: string | null
          created_at: string | null
          currency: string
          iban: string | null
          identification_hash: string | null
          label: string | null
          uid: string
          user_id: string
        }
        Insert: {
          consent_valid_until?: string | null
          created_at?: string | null
          currency: string
          iban?: string | null
          identification_hash?: string | null
          label?: string | null
          uid: string
          user_id: string
        }
        Update: {
          consent_valid_until?: string | null
          created_at?: string | null
          currency?: string
          iban?: string | null
          identification_hash?: string | null
          label?: string | null
          uid?: string
          user_id?: string
        }
        Relationships: []
      }
      category_rules: {
        Row: {
          created_at: string
          id: string
          match_field: string
          match_text: string
          priority: number
          set_category: string | null
          set_transaction_type: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          match_field: string
          match_text: string
          priority?: number
          set_category?: string | null
          set_transaction_type?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          match_field?: string
          match_text?: string
          priority?: number
          set_category?: string | null
          set_transaction_type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      cd_holdings: {
        Row: {
          annual_rate: number
          bank_label: string | null
          created_at: string
          currency: string
          id: string
          label: string
          maturity_date: string
          principal: number
          start_date: string
          user_id: string
        }
        Insert: {
          annual_rate: number
          bank_label?: string | null
          created_at?: string
          currency: string
          id?: string
          label: string
          maturity_date: string
          principal: number
          start_date: string
          user_id: string
        }
        Update: {
          annual_rate?: number
          bank_label?: string | null
          created_at?: string
          currency?: string
          id?: string
          label?: string
          maturity_date?: string
          principal?: number
          start_date?: string
          user_id?: string
        }
        Relationships: []
      }
      crypto_holdings: {
        Row: {
          amount: number
          asset_symbol: string
          coingecko_id: string
          created_at: string
          name: string
          source: string
          user_id: string
        }
        Insert: {
          amount: number
          asset_symbol: string
          coingecko_id: string
          created_at?: string
          name: string
          source: string
          user_id: string
        }
        Update: {
          amount?: number
          asset_symbol?: string
          coingecko_id?: string
          created_at?: string
          name?: string
          source?: string
          user_id?: string
        }
        Relationships: []
      }
      crypto_snapshots: {
        Row: {
          amount: number
          asset_symbol: string
          created_at: string
          price_usd: number
          snapshot_date: string
          source: string
          user_id: string
          value_eur: number | null
          value_usd: number
        }
        Insert: {
          amount: number
          asset_symbol: string
          created_at?: string
          price_usd: number
          snapshot_date: string
          source: string
          user_id: string
          value_eur?: number | null
          value_usd: number
        }
        Update: {
          amount?: number
          asset_symbol?: string
          created_at?: string
          price_usd?: number
          snapshot_date?: string
          source?: string
          user_id?: string
          value_eur?: number | null
          value_usd?: number
        }
        Relationships: [
          {
            foreignKeyName: "crypto_snapshots_user_id_asset_symbol_source_fkey"
            columns: ["user_id", "asset_symbol", "source"]
            isOneToOne: false
            referencedRelation: "crypto_holdings"
            referencedColumns: ["user_id", "asset_symbol", "source"]
          },
          {
            foreignKeyName: "crypto_snapshots_user_id_asset_symbol_source_fkey"
            columns: ["user_id", "asset_symbol", "source"]
            isOneToOne: false
            referencedRelation: "v_crypto_latest"
            referencedColumns: ["user_id", "asset_symbol", "source"]
          },
        ]
      }
      fx_rates: {
        Row: {
          created_at: string
          currency: string
          date: string
          rate_to_eur: number
        }
        Insert: {
          created_at?: string
          currency: string
          date: string
          rate_to_eur: number
        }
        Update: {
          created_at?: string
          currency?: string
          date?: string
          rate_to_eur?: number
        }
        Relationships: []
      }
      net_worth_snapshots: {
        Row: {
          account_uid: string | null
          amount: number
          created_at: string | null
          currency: string
          eur_equivalent: number | null
          id: number
          snapshot_date: string
          user_id: string
        }
        Insert: {
          account_uid?: string | null
          amount: number
          created_at?: string | null
          currency: string
          eur_equivalent?: number | null
          id?: never
          snapshot_date: string
          user_id: string
        }
        Update: {
          account_uid?: string | null
          amount?: number
          created_at?: string | null
          currency?: string
          eur_equivalent?: number | null
          id?: never
          snapshot_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "net_worth_snapshots_account_uid_fkey"
            columns: ["account_uid"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["uid"]
          },
          {
            foreignKeyName: "net_worth_snapshots_account_uid_fkey"
            columns: ["account_uid"]
            isOneToOne: false
            referencedRelation: "v_bank_accounts_latest"
            referencedColumns: ["uid"]
          },
        ]
      }
      pending_bank_consents: {
        Row: {
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      portfolio_holdings: {
        Row: {
          asset_type: string | null
          broker_label: string
          created_at: string
          isin: string
          name: string
          shares: number
          user_id: string
          yahoo_symbol: string
        }
        Insert: {
          asset_type?: string | null
          broker_label?: string
          created_at?: string
          isin: string
          name: string
          shares: number
          user_id: string
          yahoo_symbol: string
        }
        Update: {
          asset_type?: string | null
          broker_label?: string
          created_at?: string
          isin?: string
          name?: string
          shares?: number
          user_id?: string
          yahoo_symbol?: string
        }
        Relationships: []
      }
      portfolio_snapshots: {
        Row: {
          created_at: string
          currency: string
          isin: string
          price: number
          snapshot_date: string
          user_id: string
          value_eur: number | null
          value_native: number
        }
        Insert: {
          created_at?: string
          currency: string
          isin: string
          price: number
          snapshot_date: string
          user_id: string
          value_eur?: number | null
          value_native: number
        }
        Update: {
          created_at?: string
          currency?: string
          isin?: string
          price?: number
          snapshot_date?: string
          user_id?: string
          value_eur?: number | null
          value_native?: number
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_snapshots_user_id_isin_fkey"
            columns: ["user_id", "isin"]
            isOneToOne: false
            referencedRelation: "portfolio_holdings"
            referencedColumns: ["user_id", "isin"]
          },
          {
            foreignKeyName: "portfolio_snapshots_user_id_isin_fkey"
            columns: ["user_id", "isin"]
            isOneToOne: false
            referencedRelation: "v_portfolio_latest"
            referencedColumns: ["user_id", "isin"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: []
      }
      subscription_billing_overrides: {
        Row: {
          billing_frequency: string | null
          created_at: string
          creditor_name: string
          custom_interval_unit: string | null
          custom_interval_value: number | null
          user_id: string
        }
        Insert: {
          billing_frequency?: string | null
          created_at?: string
          creditor_name: string
          custom_interval_unit?: string | null
          custom_interval_value?: number | null
          user_id: string
        }
        Update: {
          billing_frequency?: string | null
          created_at?: string
          creditor_name?: string
          custom_interval_unit?: string | null
          custom_interval_value?: number | null
          user_id?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          account_uid: string | null
          amount: number
          bank_transaction_code: string | null
          booking_date: string | null
          category: string | null
          created_at: string | null
          credit_debit_indicator: string | null
          creditor_name: string | null
          currency: string
          debtor_name: string | null
          entry_reference: string
          flow_type: string | null
          owed_by: string | null
          owed_settled: boolean
          personal_amount: number | null
          raw: Json | null
          remittance_info: string | null
          settled_at: string | null
          transaction_type: string | null
          user_id: string
          value_date: string | null
          worth_it: string | null
          worth_it_prompted_at: string | null
        }
        Insert: {
          account_uid?: string | null
          amount: number
          bank_transaction_code?: string | null
          booking_date?: string | null
          category?: string | null
          created_at?: string | null
          credit_debit_indicator?: string | null
          creditor_name?: string | null
          currency: string
          debtor_name?: string | null
          entry_reference: string
          flow_type?: string | null
          owed_by?: string | null
          owed_settled?: boolean
          personal_amount?: number | null
          raw?: Json | null
          remittance_info?: string | null
          settled_at?: string | null
          transaction_type?: string | null
          user_id: string
          value_date?: string | null
          worth_it?: string | null
          worth_it_prompted_at?: string | null
        }
        Update: {
          account_uid?: string | null
          amount?: number
          bank_transaction_code?: string | null
          booking_date?: string | null
          category?: string | null
          created_at?: string | null
          credit_debit_indicator?: string | null
          creditor_name?: string | null
          currency?: string
          debtor_name?: string | null
          entry_reference?: string
          flow_type?: string | null
          owed_by?: string | null
          owed_settled?: boolean
          personal_amount?: number | null
          raw?: Json | null
          remittance_info?: string | null
          settled_at?: string | null
          transaction_type?: string | null
          user_id?: string
          value_date?: string | null
          worth_it?: string | null
          worth_it_prompted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_uid_fkey"
            columns: ["account_uid"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["uid"]
          },
          {
            foreignKeyName: "transactions_account_uid_fkey"
            columns: ["account_uid"]
            isOneToOne: false
            referencedRelation: "v_bank_accounts_latest"
            referencedColumns: ["uid"]
          },
        ]
      }
    }
    Views: {
      v_bank_accounts_latest: {
        Row: {
          amount: number | null
          amount_eur: number | null
          consent_valid_until: string | null
          currency: string | null
          iban: string | null
          label: string | null
          snapshot_date: string | null
          uid: string | null
          user_id: string | null
        }
        Relationships: []
      }
      v_cd_holdings: {
        Row: {
          annual_rate: number | null
          bank_label: string | null
          currency: string | null
          current_value_eur: number | null
          current_value_native: number | null
          days_elapsed: number | null
          id: string | null
          is_matured: boolean | null
          label: string | null
          maturity_date: string | null
          principal: number | null
          start_date: string | null
          user_id: string | null
        }
        Relationships: []
      }
      v_crypto_latest: {
        Row: {
          amount: number | null
          asset_symbol: string | null
          name: string | null
          price_usd: number | null
          snapshot_date: string | null
          source: string | null
          user_id: string | null
          value_eur: number | null
          value_usd: number | null
        }
        Relationships: []
      }
      v_income_vs_expenses_monthly: {
        Row: {
          expenses_eur: number | null
          income_eur: number | null
          month: string | null
          user_id: string | null
        }
        Relationships: []
      }
      v_net_worth_daily: {
        Row: {
          bank_total_eur: number | null
          crypto_total_eur: number | null
          portfolio_total_eur: number | null
          snapshot_date: string | null
          total_eur: number | null
          user_id: string | null
        }
        Relationships: []
      }
      v_net_worth_eur: {
        Row: {
          account_uid: string | null
          amount: number | null
          amount_eur: number | null
          currency: string | null
          snapshot_date: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "net_worth_snapshots_account_uid_fkey"
            columns: ["account_uid"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["uid"]
          },
          {
            foreignKeyName: "net_worth_snapshots_account_uid_fkey"
            columns: ["account_uid"]
            isOneToOne: false
            referencedRelation: "v_bank_accounts_latest"
            referencedColumns: ["uid"]
          },
        ]
      }
      v_portfolio_latest: {
        Row: {
          asset_type: string | null
          broker_label: string | null
          currency: string | null
          isin: string | null
          name: string | null
          price: number | null
          shares: number | null
          snapshot_date: string | null
          user_id: string | null
          value_eur: number | null
          value_native: number | null
        }
        Relationships: []
      }
      v_spend_by_category_monthly: {
        Row: {
          category: string | null
          month: string | null
          spend_eur: number | null
          user_id: string | null
        }
        Relationships: []
      }
      v_subscriptions: {
        Row: {
          amount: number | null
          billing_frequency: string | null
          billing_frequency_is_manual: boolean | null
          category: string | null
          charge_count: number | null
          creditor_name: string | null
          currency: string | null
          custom_interval_unit: string | null
          custom_interval_value: number | null
          interval_days: number | null
          last_charged: string | null
          monthly_equivalent_eur: number | null
          signed_amount_eur: number | null
          user_id: string | null
        }
        Relationships: []
      }
      v_transactions_eur: {
        Row: {
          account_uid: string | null
          amount: number | null
          booking_date: string | null
          category: string | null
          created_at: string | null
          credit_debit_indicator: string | null
          creditor_name: string | null
          currency: string | null
          entry_reference: string | null
          flow_type: string | null
          owed_by: string | null
          owed_settled: boolean | null
          personal_amount: number | null
          personal_signed_amount_eur: number | null
          settled_at: string | null
          signed_amount_eur: number | null
          transaction_type: string | null
          user_id: string | null
          worth_it: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_uid_fkey"
            columns: ["account_uid"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["uid"]
          },
          {
            foreignKeyName: "transactions_account_uid_fkey"
            columns: ["account_uid"]
            isOneToOne: false
            referencedRelation: "v_bank_accounts_latest"
            referencedColumns: ["uid"]
          },
        ]
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
