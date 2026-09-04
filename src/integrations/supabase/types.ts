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
          created_at: string | null
          currency: string
          iban: string | null
          label: string | null
          uid: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          currency: string
          iban?: string | null
          label?: string | null
          uid: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          currency?: string
          iban?: string | null
          label?: string | null
          uid?: string
          user_id?: string
        }
        Relationships: []
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
        ]
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
          raw: Json | null
          remittance_info: string | null
          user_id: string
          value_date: string | null
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
          raw?: Json | null
          remittance_info?: string | null
          user_id: string
          value_date?: string | null
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
          raw?: Json | null
          remittance_info?: string | null
          user_id?: string
          value_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_uid_fkey"
            columns: ["account_uid"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["uid"]
          },
        ]
      }
    }
    Views: {
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
        ]
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
      v_transactions_eur: {
        Row: {
          account_uid: string | null
          amount: number | null
          booking_date: string | null
          category: string | null
          creditor_name: string | null
          currency: string | null
          entry_reference: string | null
          signed_amount_eur: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_uid_fkey"
            columns: ["account_uid"]
            isOneToOne: false
            referencedRelation: "accounts"
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
