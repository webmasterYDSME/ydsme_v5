export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      committees: {
        Row: {
          created_at: string
          created_by: string
          email: string
          file_url: string
          id: number
          name: string
          title: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string
          email: string
          file_url?: string
          id?: number
          name?: string
          title: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          email?: string
          file_url?: string
          id?: number
          name?: string
          title?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "committees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      configs: {
        Row: {
          affiliates: Json[]
          company_no: string
          contacts: Json[]
          created_at: string
          full_name: string
          id: number
          registered_address: Json
          registered_name: string
          settings: Json
          short_name: string
          socials: Json[]
          telephone: string
          website: string
        }
        Insert: {
          affiliates?: Json[]
          company_no?: string
          contacts?: Json[]
          created_at?: string
          full_name?: string
          id?: number
          registered_address: Json
          registered_name?: string
          settings: Json
          short_name?: string
          socials?: Json[]
          telephone?: string
          website?: string
        }
        Update: {
          affiliates?: Json[]
          company_no?: string
          contacts?: Json[]
          created_at?: string
          full_name?: string
          id?: number
          registered_address?: Json
          registered_name?: string
          settings?: Json
          short_name?: string
          socials?: Json[]
          telephone?: string
          website?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          id: string
          stripe_customer_id: string | null
        }
        Insert: {
          id: string
          stripe_customer_id?: string | null
        }
        Update: {
          id?: string
          stripe_customer_id?: string | null
        }
        Relationships: []
      }
      donation_payments: {
        Row: {
          amount_pence: number
          campaign: string
          created_at: string
          currency: string
          id: string
          paid_at: string
          payment_status: string
          refunded_pence: number
          stripe_checkout_session_id: string
          stripe_event_id: string
          stripe_payment_intent_id: string | null
          updated_at: string
        }
        Insert: {
          amount_pence: number
          campaign: string
          created_at?: string
          currency: string
          id?: string
          paid_at: string
          payment_status: string
          refunded_pence?: number
          stripe_checkout_session_id: string
          stripe_event_id: string
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_pence?: number
          campaign?: string
          created_at?: string
          currency?: string
          id?: string
          paid_at?: string
          payment_status?: string
          refunded_pence?: number
          stripe_checkout_session_id?: string
          stripe_event_id?: string
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          category: Database["public"]["Enums"]["file_category"]
          created_at: string
          created_by: string | null
          descriptions: string
          file_url: string
          id: string
          name: string
        }
        Insert: {
          category: Database["public"]["Enums"]["file_category"]
          created_at?: string
          created_by?: string | null
          descriptions?: string
          file_url?: string
          id?: string
          name?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["file_category"]
          created_at?: string
          created_by?: string | null
          descriptions?: string
          file_url?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          booking_capacity: number | null
          booking_enabled: boolean
          created_at: string
          descriptions: string
          display_in_homepage: boolean
          end_date: string
          end_time: string
          event_type: Database["public"]["Enums"]["event_type"]
          file_url: string
          host: string
          id: number
          is_ticket_required: boolean
          name: string
          reservation_link: string
          start_date: string
          start_time: string
        }
        Insert: {
          booking_capacity?: number | null
          booking_enabled?: boolean
          created_at?: string
          descriptions?: string
          display_in_homepage?: boolean
          end_date: string
          end_time: string
          event_type?: Database["public"]["Enums"]["event_type"]
          file_url?: string
          host?: string
          id?: number
          is_ticket_required?: boolean
          name?: string
          reservation_link?: string
          start_date: string
          start_time: string
        }
        Update: {
          booking_capacity?: number | null
          booking_enabled?: boolean
          created_at?: string
          descriptions?: string
          display_in_homepage?: boolean
          end_date?: string
          end_time?: string
          event_type?: Database["public"]["Enums"]["event_type"]
          file_url?: string
          host?: string
          id?: number
          is_ticket_required?: boolean
          name?: string
          reservation_link?: string
          start_date?: string
          start_time?: string
        }
        Relationships: []
      }
      event_bookings: {
        Row: {
          checked_in_at: string | null
          checked_in_by: string | null
          confirmation_email_error: string | null
          confirmation_email_sent_at: string | null
          created_at: string
          email: string
          event_id: number
          id: string
          lead_name: string
          party_size: number
          reference_code: string
          status: string
          updated_at: string
        }
        Insert: {
          checked_in_at?: string | null
          checked_in_by?: string | null
          confirmation_email_error?: string | null
          confirmation_email_sent_at?: string | null
          created_at?: string
          email: string
          event_id: number
          id?: string
          lead_name: string
          party_size: number
          reference_code: string
          status?: string
          updated_at?: string
        }
        Update: {
          checked_in_at?: string | null
          checked_in_by?: string | null
          confirmation_email_error?: string | null
          confirmation_email_sent_at?: string | null
          created_at?: string
          email?: string
          event_id?: number
          id?: string
          lead_name?: string
          party_size?: number
          reference_code?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_bookings_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      feeds: {
        Row: {
          author_id: string | null
          author_name: string | null
          created_at: string
          id: number
          message: string
          title: string | null
          type: Database["public"]["Enums"]["feed_type"]
          url: string | null
        }
        Insert: {
          author_id?: string | null
          author_name?: string | null
          created_at?: string
          id?: number
          message: string
          title?: string | null
          type: Database["public"]["Enums"]["feed_type"]
          url?: string | null
        }
        Update: {
          author_id?: string | null
          author_name?: string | null
          created_at?: string
          id?: number
          message?: string
          title?: string | null
          type?: Database["public"]["Enums"]["feed_type"]
          url?: string | null
        }
        Relationships: []
      }
      participants: {
        Row: {
          created_at: string
          id: number
          participant_id: string
          reference_id: string
        }
        Insert: {
          created_at?: string
          id?: number
          participant_id?: string
          reference_id?: string
        }
        Update: {
          created_at?: string
          id?: number
          participant_id?: string
          reference_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_participants_reference_id_fkey"
            columns: ["reference_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      prices: {
        Row: {
          active: boolean | null
          currency: string | null
          description: string | null
          id: string
          interval: Database["public"]["Enums"]["pricing_plan_interval"] | null
          interval_count: number | null
          metadata: Json | null
          product_id: string | null
          trial_period_days: number | null
          type: Database["public"]["Enums"]["pricing_type"] | null
          unit_amount: number | null
        }
        Insert: {
          active?: boolean | null
          currency?: string | null
          description?: string | null
          id: string
          interval?: Database["public"]["Enums"]["pricing_plan_interval"] | null
          interval_count?: number | null
          metadata?: Json | null
          product_id?: string | null
          trial_period_days?: number | null
          type?: Database["public"]["Enums"]["pricing_type"] | null
          unit_amount?: number | null
        }
        Update: {
          active?: boolean | null
          currency?: string | null
          description?: string | null
          id?: string
          interval?: Database["public"]["Enums"]["pricing_plan_interval"] | null
          interval_count?: number | null
          metadata?: Json | null
          product_id?: string | null
          trial_period_days?: number | null
          type?: Database["public"]["Enums"]["pricing_type"] | null
          unit_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean | null
          description: string | null
          id: string
          image: string | null
          metadata: Json | null
          name: string | null
        }
        Insert: {
          active?: boolean | null
          description?: string | null
          id: string
          image?: string | null
          metadata?: Json | null
          name?: string | null
        }
        Update: {
          active?: boolean | null
          description?: string | null
          id?: string
          image?: string | null
          metadata?: Json | null
          name?: string | null
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          id: number
          permission: Database["public"]["Enums"]["app_permission"]
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          id?: number
          permission: Database["public"]["Enums"]["app_permission"]
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          id?: number
          permission?: Database["public"]["Enums"]["app_permission"]
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at: string | null
          cancel_at_period_end: boolean | null
          canceled_at: string | null
          created: string
          current_period_end: string
          current_period_start: string
          ended_at: string | null
          id: string
          metadata: Json | null
          price_id: string | null
          quantity: number | null
          status: Database["public"]["Enums"]["subscription_status"] | null
          trial_end: string | null
          trial_start: string | null
          user_id: string
        }
        Insert: {
          cancel_at?: string | null
          cancel_at_period_end?: boolean | null
          canceled_at?: string | null
          created?: string
          current_period_end?: string
          current_period_start?: string
          ended_at?: string | null
          id: string
          metadata?: Json | null
          price_id?: string | null
          quantity?: number | null
          status?: Database["public"]["Enums"]["subscription_status"] | null
          trial_end?: string | null
          trial_start?: string | null
          user_id: string
        }
        Update: {
          cancel_at?: string | null
          cancel_at_period_end?: boolean | null
          canceled_at?: string | null
          created?: string
          current_period_end?: string
          current_period_start?: string
          ended_at?: string | null
          id?: string
          metadata?: Json | null
          price_id?: string | null
          quantity?: number | null
          status?: Database["public"]["Enums"]["subscription_status"] | null
          trial_end?: string | null
          trial_start?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_price_id_fkey"
            columns: ["price_id"]
            isOneToOne: false
            referencedRelation: "prices"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: number
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: number
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: number
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          billing_address: Json | null
          birthday: string | null
          club_rules_agreement: boolean
          contact_number: string | null
          email: string
          full_name: string | null
          id: string
          payment_method: Json | null
          title: string
        }
        Insert: {
          avatar_url?: string | null
          billing_address?: Json | null
          birthday?: string | null
          club_rules_agreement?: boolean
          contact_number?: string | null
          email: string
          full_name?: string | null
          id: string
          payment_method?: Json | null
          title?: string
        }
        Update: {
          avatar_url?: string | null
          billing_address?: Json | null
          birthday?: string | null
          club_rules_agreement?: boolean
          contact_number?: string | null
          email?: string
          full_name?: string | null
          id?: string
          payment_method?: Json | null
          title?: string
        }
        Relationships: []
      }
      workshops: {
        Row: {
          created_at: string
          created_by: string
          date: string
          descriptions: string
          end_time: string
          host_name: string
          id: string
          maximum_participants: number
          notes: string
          start_time: string
          title: string
          venue: string
          virtual_link: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          date: string
          descriptions: string
          end_time: string
          host_name: string
          id?: string
          maximum_participants?: number
          notes?: string
          start_time: string
          title: string
          venue?: string
          virtual_link?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          date?: string
          descriptions?: string
          end_time?: string
          host_name?: string
          id?: string
          maximum_participants?: number
          notes?: string
          start_time?: string
          title?: string
          venue?: string
          virtual_link?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      authorize: {
        Args: {
          requested_permission: Database["public"]["Enums"]["app_permission"]
        }
        Returns: boolean
      }
      custom_access_token_hook: {
        Args: {
          event: Json
        }
        Returns: Json
      }
      create_event_booking: {
        Args: {
          p_email: string
          p_event_id: number
          p_lead_name: string
          p_party_size: number
          p_reference_code: string
        }
        Returns: {
          available_places: number
          booking_id: string
          reference_code: string
        }[]
      }
      target_donation_total_pence: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      update_users: {
        Args: {
          user_id: string
          user_email: string
          user_title: string
          user_full_name: string
          user_birthday: string
          user_contact_number: string
          user_avatar_url: string
          user_billing_address: Json
          user_club_rules_agreement: boolean
        }
        Returns: undefined
      }
    }
    Enums: {
      app_permission:
        | "moderator.select"
        | "moderator.create"
        | "moderator.update"
        | "moderator.delete"
        | "committee.select"
        | "committee.create"
        | "committee.update"
        | "committee.delete"
        | "read-only-committee.select"
        | "read-only-committee.create"
        | "read-only-committee.update"
        | "read-only-committee.delete"
        | "administrator.select"
        | "administrator.create"
        | "administrator.update"
        | "administrator.delete"
      app_role:
        | "member"
        | "moderator"
        | "committee"
        | "read-only-committee"
        | "administrator"
      event_type: "member_only" | "public"
      feed_type:
        | "event"
        | "user"
        | "document"
        | "workshop"
        | "message"
        | "broadcast"
      file_category:
        | "publication"
        | "minute"
        | "insurance-policy"
        | "club-rule"
        | "calendar"
        | "boiler-guide"
        | "others"
      pricing_plan_interval: "day" | "week" | "month" | "year"
      pricing_type: "one_time" | "recurring"
      subscription_status:
        | "trialing"
        | "active"
        | "canceled"
        | "incomplete"
        | "incomplete_expired"
        | "past_due"
        | "unpaid"
        | "paused"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never
