export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      announcements: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          body: string
          created_at: string
          created_by: string | null
          id: number
          lifecycle_status: string
          published_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          body: string
          created_at?: string
          created_by?: string | null
          id?: number
          lifecycle_status?: string
          published_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          body?: string
          created_at?: string
          created_by?: string | null
          id?: number
          lifecycle_status?: string
          published_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_role: string
          actor_user_id: string | null
          after_state: Json | null
          before_state: Json | null
          entity_id: string
          entity_type: string
          id: string
          occurred_at: string
          summary: string
        }
        Insert: {
          action: string
          actor_role: string
          actor_user_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          entity_id: string
          entity_type: string
          id?: string
          occurred_at?: string
          summary?: string
        }
        Update: {
          action?: string
          actor_role?: string
          actor_user_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          entity_id?: string
          entity_type?: string
          id?: string
          occurred_at?: string
          summary?: string
        }
        Relationships: []
      }
      committees: {
        Row: {
          created_at: string
          created_by: string | null
          email: string
          file_url: string
          id: number
          name: string
          title: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email: string
          file_url?: string
          id?: number
          name?: string
          title: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
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
          club_address: Json
          company_no: string
          contacts: Json[]
          created_at: string
          email: string
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
          club_address?: Json
          company_no?: string
          contacts?: Json[]
          created_at?: string
          email?: string
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
          club_address?: Json
          company_no?: string
          contacts?: Json[]
          created_at?: string
          email?: string
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
      documents: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          category: Database["public"]["Enums"]["file_category"]
          created_at: string
          created_by: string | null
          descriptions: string
          file_url: string
          id: string
          lifecycle_status: string
          name: string
          updated_at: string
          version: number
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          category: Database["public"]["Enums"]["file_category"]
          created_at?: string
          created_by?: string | null
          descriptions?: string
          file_url?: string
          id?: string
          lifecycle_status?: string
          name?: string
          updated_at?: string
          version?: number
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          category?: Database["public"]["Enums"]["file_category"]
          created_at?: string
          created_by?: string | null
          descriptions?: string
          file_url?: string
          id?: string
          lifecycle_status?: string
          name?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      donation_campaigns: {
        Row: {
          button_label: string
          description: string
          enabled: boolean
          kind: string
          target_pence: number
          title: string
          updated_at: string
        }
        Insert: {
          button_label: string
          description: string
          enabled?: boolean
          kind: string
          target_pence?: number
          title: string
          updated_at?: string
        }
        Update: {
          button_label?: string
          description?: string
          enabled?: boolean
          kind?: string
          target_pence?: number
          title?: string
          updated_at?: string
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
      event_booking_abuse_summary: {
        Row: {
          both_blocks: number
          browser_blocks: number
          event_id: number
          ip_blocks: number
          last_blocked_at: string
          updated_at: string
        }
        Insert: {
          both_blocks?: number
          browser_blocks?: number
          event_id: number
          ip_blocks?: number
          last_blocked_at?: string
          updated_at?: string
        }
        Update: {
          both_blocks?: number
          browser_blocks?: number
          event_id?: number
          ip_blocks?: number
          last_blocked_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_booking_abuse_summary_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_bookings: {
        Row: {
          anonymized_at: string | null
          booking_device_hash: string | null
          booking_ip_hash: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          checked_in_at: string | null
          checked_in_by: string | null
          confirmation_email_attempts: number
          confirmation_email_error: string | null
          confirmation_email_last_attempt_at: string | null
          confirmation_email_sent_at: string | null
          created_at: string
          email: string
          event_id: number
          id: string
          lead_name: string
          party_size: number
          reference_code: string
          retention_until: string | null
          status: string
          updated_at: string
        }
        Insert: {
          anonymized_at?: string | null
          booking_device_hash?: string | null
          booking_ip_hash?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          checked_in_at?: string | null
          checked_in_by?: string | null
          confirmation_email_attempts?: number
          confirmation_email_error?: string | null
          confirmation_email_last_attempt_at?: string | null
          confirmation_email_sent_at?: string | null
          created_at?: string
          email: string
          event_id: number
          id?: string
          lead_name: string
          party_size: number
          reference_code: string
          retention_until?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          anonymized_at?: string | null
          booking_device_hash?: string | null
          booking_ip_hash?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          checked_in_at?: string | null
          checked_in_by?: string | null
          confirmation_email_attempts?: number
          confirmation_email_error?: string | null
          confirmation_email_last_attempt_at?: string | null
          confirmation_email_sent_at?: string | null
          created_at?: string
          email?: string
          event_id?: number
          id?: string
          lead_name?: string
          party_size?: number
          reference_code?: string
          retention_until?: string | null
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
      events: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          booking_capacity: number | null
          booking_enabled: boolean
          booking_mode: string
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
          lifecycle_status: string
          name: string
          public_teaser_enabled: boolean
          reservation_link: string
          start_date: string
          start_time: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          booking_capacity?: number | null
          booking_enabled?: boolean
          booking_mode?: string
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
          lifecycle_status?: string
          name?: string
          public_teaser_enabled?: boolean
          reservation_link?: string
          start_date: string
          start_time: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          booking_capacity?: number | null
          booking_enabled?: boolean
          booking_mode?: string
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
          lifecycle_status?: string
          name?: string
          public_teaser_enabled?: boolean
          reservation_link?: string
          start_date?: string
          start_time?: string
          updated_at?: string
        }
        Relationships: []
      }
      feeds: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          author_id: string | null
          author_name: string | null
          created_at: string
          id: number
          lifecycle_status: string
          message: string
          title: string | null
          type: Database["public"]["Enums"]["feed_type"]
          updated_at: string
          url: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          author_id?: string | null
          author_name?: string | null
          created_at?: string
          id?: number
          lifecycle_status?: string
          message: string
          title?: string | null
          type: Database["public"]["Enums"]["feed_type"]
          updated_at?: string
          url?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          author_id?: string | null
          author_name?: string | null
          created_at?: string
          id?: number
          lifecycle_status?: string
          message?: string
          title?: string | null
          type?: Database["public"]["Enums"]["feed_type"]
          updated_at?: string
          url?: string | null
        }
        Relationships: []
      }
      membership_imports: {
        Row: {
          applied_at: string | null
          created_at: string
          created_by: string | null
          expires_at: string
          file_sha256: string
          id: string
          import_mode: string
          row_count: number
          source: string
          source_encoding: string
          status: string
          summary: Json
        }
        Insert: {
          applied_at?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string
          file_sha256: string
          id?: string
          import_mode: string
          row_count: number
          source?: string
          source_encoding: string
          status?: string
          summary?: Json
        }
        Update: {
          applied_at?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string
          file_sha256?: string
          id?: string
          import_mode?: string
          row_count?: number
          source?: string
          source_encoding?: string
          status?: string
          summary?: Json
        }
        Relationships: []
      }
      membership_records: {
        Row: {
          auth_user_id: string | null
          contact_email: string | null
          created_at: string
          external_id: string
          first_name: string
          id: string
          last_name: string
          last_seen_at: string | null
          last_seen_import_id: string | null
          legal_hold: boolean
          legal_hold_reason: string | null
          legal_hold_review_at: string | null
          membership_ended_at: string | null
          membership_type: string
          portal_access_review_decision: string | null
          portal_access_review_reason: string | null
          portal_access_review_required: boolean
          portal_access_reviewed_at: string | null
          portal_access_reviewed_by: string | null
          retention_until: string | null
          source: string
          source_expires_on: string | null
          source_member_since: string | null
          source_renewed_on: string | null
          source_rules_agreement: boolean | null
          source_state: string
          title: string
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          contact_email?: string | null
          created_at?: string
          external_id: string
          first_name: string
          id?: string
          last_name: string
          last_seen_at?: string | null
          last_seen_import_id?: string | null
          legal_hold?: boolean
          legal_hold_reason?: string | null
          legal_hold_review_at?: string | null
          membership_ended_at?: string | null
          membership_type: string
          portal_access_review_decision?: string | null
          portal_access_review_reason?: string | null
          portal_access_review_required?: boolean
          portal_access_reviewed_at?: string | null
          portal_access_reviewed_by?: string | null
          retention_until?: string | null
          source?: string
          source_expires_on?: string | null
          source_member_since?: string | null
          source_renewed_on?: string | null
          source_rules_agreement?: boolean | null
          source_state: string
          title?: string
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          contact_email?: string | null
          created_at?: string
          external_id?: string
          first_name?: string
          id?: string
          last_name?: string
          last_seen_at?: string | null
          last_seen_import_id?: string | null
          legal_hold?: boolean
          legal_hold_reason?: string | null
          legal_hold_review_at?: string | null
          membership_ended_at?: string | null
          membership_type?: string
          portal_access_review_decision?: string | null
          portal_access_review_reason?: string | null
          portal_access_review_required?: boolean
          portal_access_reviewed_at?: string | null
          portal_access_reviewed_by?: string | null
          retention_until?: string | null
          source?: string
          source_expires_on?: string | null
          source_member_since?: string | null
          source_renewed_on?: string | null
          source_rules_agreement?: boolean | null
          source_state?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_records_last_seen_import_id_fkey"
            columns: ["last_seen_import_id"]
            isOneToOne: false
            referencedRelation: "membership_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      member_project_comments: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          author_id: string | null
          body: string
          created_at: string
          id: string
          project_id: string
          update_id: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          project_id: string
          update_id?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          project_id?: string
          update_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "member_project_comments_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_project_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_project_comments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "member_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_project_comments_update_id_fkey"
            columns: ["update_id"]
            isOneToOne: false
            referencedRelation: "member_project_updates"
            referencedColumns: ["id"]
          },
        ]
      }
      member_project_follows: {
        Row: {
          created_at: string
          project_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          project_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_project_follows_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "member_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_project_follows_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      member_project_photos: {
        Row: {
          caption: string
          created_at: string
          id: string
          sort_order: number
          storage_path: string
          update_id: string
        }
        Insert: {
          caption?: string
          created_at?: string
          id?: string
          sort_order?: number
          storage_path: string
          update_id: string
        }
        Update: {
          caption?: string
          created_at?: string
          id?: string
          sort_order?: number
          storage_path?: string
          update_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_project_photos_update_id_fkey"
            columns: ["update_id"]
            isOneToOne: false
            referencedRelation: "member_project_updates"
            referencedColumns: ["id"]
          },
        ]
      }
      member_project_updates: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          help_type: string | null
          id: string
          project_id: string
          title: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          help_type?: string | null
          id?: string
          project_id: string
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          help_type?: string | null
          id?: string
          project_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_project_updates_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_project_updates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "member_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      member_projects: {
        Row: {
          archived_at: string | null
          category: string
          completed_at: string | null
          cover_image_path: string | null
          created_at: string
          id: string
          owner_id: string | null
          project_status: string
          summary: string
          title: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          category: string
          completed_at?: string | null
          cover_image_path?: string | null
          created_at?: string
          id?: string
          owner_id?: string | null
          project_status?: string
          summary: string
          title: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          category?: string
          completed_at?: string | null
          cover_image_path?: string | null
          created_at?: string
          id?: string
          owner_id?: string | null
          project_status?: string
          summary?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_projects_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      participants: {
        Row: {
          cancelled_at: string | null
          created_at: string
          id: number
          notification_email_attempts: number
          notification_email_error: string | null
          notification_email_last_attempt_at: string | null
          notification_email_sent_at: string | null
          participant_id: string | null
          reference_id: string
          reservation_status: string
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          id?: number
          notification_email_attempts?: number
          notification_email_error?: string | null
          notification_email_last_attempt_at?: string | null
          notification_email_sent_at?: string | null
          participant_id?: string | null
          reference_id?: string
          reservation_status?: string
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          id?: number
          notification_email_attempts?: number
          notification_email_error?: string | null
          notification_email_last_attempt_at?: string | null
          notification_email_sent_at?: string | null
          participant_id?: string | null
          reference_id?: string
          reservation_status?: string
          updated_at?: string
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
      rate_limits: {
        Row: {
          attempts: number
          expires_at: string
          scope: string
          subject_hash: string
          window_started_at: string
        }
        Insert: {
          attempts?: number
          expires_at: string
          scope: string
          subject_hash: string
          window_started_at: string
        }
        Update: {
          attempts?: number
          expires_at?: string
          scope?: string
          subject_hash?: string
          window_started_at?: string
        }
        Relationships: []
      }
      site_affiliates: {
        Row: {
          id: number
          logo_path: string
          name: string
          position: number
          url: string
        }
        Insert: {
          id?: number
          logo_path?: string
          name: string
          position: number
          url?: string
        }
        Update: {
          id?: number
          logo_path?: string
          name?: string
          position?: number
          url?: string
        }
        Relationships: []
      }
      site_social_links: {
        Row: {
          id: number
          name: string
          position: number
          url: string
        }
        Insert: {
          id?: number
          name: string
          position: number
          url?: string
        }
        Update: {
          id?: number
          name?: string
          position?: number
          url?: string
        }
        Relationships: []
      }
      stripe_webhook_events: {
        Row: {
          claimed_at: string | null
          completed_at: string | null
          event_type: string
          last_error: string | null
          processing_status: string
          processed_at: string
          stripe_event_id: string
        }
        Insert: {
          claimed_at?: string | null
          completed_at?: string | null
          event_type: string
          last_error?: string | null
          processing_status?: string
          processed_at?: string
          stripe_event_id: string
        }
        Update: {
          claimed_at?: string | null
          completed_at?: string | null
          event_type?: string
          last_error?: string | null
          processing_status?: string
          processed_at?: string
          stripe_event_id?: string
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
          role: string
          user_id: string
        }
        Insert: {
          id?: number
          role?: string
          user_id: string
        }
        Update: {
          id?: number
          role?: string
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
          archived_at: string | null
          archived_by: string | null
          avatar_url: string | null
          billing_address: Json | null
          birthday: string | null
          club_rules_agreement: boolean
          contact_number: string | null
          email: string
          full_name: string | null
          id: string
          legal_hold: boolean
          membership_status: string
          payment_method: Json | null
          retention_purge_attempts: number
          retention_purge_claim_token: string | null
          retention_purge_claimed_at: string | null
          retention_purge_last_attempt_at: string | null
          retention_purge_last_error: string | null
          retention_until: string | null
          title: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          avatar_url?: string | null
          billing_address?: Json | null
          birthday?: string | null
          club_rules_agreement?: boolean
          contact_number?: string | null
          email: string
          full_name?: string | null
          id: string
          legal_hold?: boolean
          membership_status?: string
          payment_method?: Json | null
          retention_purge_attempts?: number
          retention_purge_claim_token?: string | null
          retention_purge_claimed_at?: string | null
          retention_purge_last_attempt_at?: string | null
          retention_purge_last_error?: string | null
          retention_until?: string | null
          title?: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          avatar_url?: string | null
          billing_address?: Json | null
          birthday?: string | null
          club_rules_agreement?: boolean
          contact_number?: string | null
          email?: string
          full_name?: string | null
          id?: string
          legal_hold?: boolean
          membership_status?: string
          payment_method?: Json | null
          retention_purge_attempts?: number
          retention_purge_claim_token?: string | null
          retention_purge_claimed_at?: string | null
          retention_purge_last_attempt_at?: string | null
          retention_purge_last_error?: string | null
          retention_until?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      workshops: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          created_at: string
          created_by: string | null
          date: string
          descriptions: string
          end_time: string
          host_name: string
          id: string
          lifecycle_status: string
          maximum_participants: number
          notes: string
          start_time: string
          title: string
          updated_at: string
          venue: string
          virtual_link: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          created_by?: string | null
          date: string
          descriptions: string
          end_time: string
          host_name: string
          id?: string
          lifecycle_status?: string
          maximum_participants?: number
          notes?: string
          start_time: string
          title: string
          updated_at?: string
          venue?: string
          virtual_link?: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          created_by?: string | null
          date?: string
          descriptions?: string
          end_time?: string
          host_name?: string
          id?: string
          lifecycle_status?: string
          maximum_participants?: number
          notes?: string
          start_time?: string
          title?: string
          updated_at?: string
          venue?: string
          virtual_link?: string
        }
        Relationships: []
      }
    }
    Views: {
      public_announcements: {
        Row: {
          body: string | null
          id: number | null
          published_at: string | null
          title: string | null
          updated_at: string | null
        }
        Relationships: []
      }
      public_news_announcements: {
        Row: {
          body: string | null
          id: number | null
          published_at: string | null
          title: string | null
          updated_at: string | null
        }
        Relationships: []
      }
      public_committee_roster: {
        Row: {
          email: string | null
          file_url: string | null
          id: number | null
          name: string | null
          title: string | null
        }
        Relationships: []
      }
      public_events: {
        Row: {
          booking_capacity: number | null
          booking_enabled: boolean | null
          booking_mode: string | null
          descriptions: string | null
          display_in_homepage: boolean | null
          end_date: string | null
          end_time: string | null
          event_type: Database["public"]["Enums"]["event_type"] | null
          file_url: string | null
          id: number | null
          is_ticket_required: boolean | null
          lifecycle_status: string | null
          name: string | null
          reservation_link: string | null
          start_date: string | null
          start_time: string | null
        }
        Relationships: []
      }
      public_member_event_teasers: {
        Row: {
          descriptions: string | null
          end_date: string | null
          end_time: string | null
          file_url: string | null
          id: number | null
          name: string | null
          start_date: string | null
          start_time: string | null
        }
        Relationships: []
      }
      public_site_links: {
        Row: {
          link_type: string | null
          logo_path: string | null
          name: string | null
          position: number | null
          url: string | null
        }
        Relationships: []
      }
      public_site_config: {
        Row: {
          club_address: Json | null
          company_no: string | null
          email: string | null
          full_name: string | null
          registered_address: Json | null
          registered_name: string | null
          short_name: string | null
          telephone: string | null
          website: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      anonymize_member_content_for_purge: {
        Args: { p_actor_id?: string; p_claim_token?: string; p_user_id: string }
        Returns: boolean
      }
      claim_expired_portal_accounts: {
        Args: { p_limit?: number }
        Returns: {
          claim_token: string
          user_id: string
        }[]
      }
      apply_membermojo_membership_import: {
        Args: {
          p_actor_id: string
          p_file_sha256: string
          p_import_id: string
          p_records: Json
        }
        Returns: {
          created_count: number
          processed_count: number
          refreshed_count: number
        }[]
      }
      apply_membermojo_membership_import_v2: {
        Args: {
          p_actor_id: string
          p_file_sha256: string
          p_import_id: string
          p_records: Json
        }
        Returns: {
          created_count: number
          ended_count: number
          portal_access_review_count: number
          processed_count: number
          refreshed_count: number
          restored_count: number
        }[]
      }
      cancel_workshop_place: {
        Args: { p_workshop_id: string }
        Returns: boolean
      }
      consume_rate_limit: {
        Args: {
          p_max_attempts: number
          p_scope: string
          p_subject_hash: string
          p_window_seconds: number
        }
        Returns: boolean
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
      create_event_booking_v2: {
        Args: {
          p_device_hash: string | null
          p_email: string
          p_event_id: number
          p_ip_hash: string | null
          p_lead_name: string
          p_party_size: number
          p_reference_code: string
        }
        Returns: {
          available_places: number
          block_reason: string | null
          booking_id: string | null
          outcome: string
          reference_code: string | null
        }[]
      }
      create_member_project_update: {
        Args: {
          p_body: string
          p_help_type: string
          p_photo_paths?: string[]
          p_project_id: string
          p_title: string
        }
        Returns: string
      }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      dashboard_feed_snapshot: {
        Args: { p_limit?: number }
        Returns: Json
      }
      has_app_role: { Args: { allowed_roles: string[] }; Returns: boolean }
      own_archived_notices: {
        Args: { p_limit?: number }
        Returns: {
          id: number
          title: string | null
        }[]
      }
      donation_management_summary: {
        Args: { p_from?: string | null; p_until?: string | null }
        Returns: Json
      }
      booking_management_summary: {
        Args: { p_event_id?: number | null }
        Returns: Json
      }
      record_event_booking_email_attempt: {
        Args: { p_booking_id: string; p_error: string; p_sent: boolean }
        Returns: boolean
      }
      register_membermojo_import_preview: {
        Args: {
          p_actor_id: string
          p_file_sha256: string
          p_import_mode: string
          p_row_count: number
          p_source_encoding: string
          p_summary: Json
        }
        Returns: {
          import_expires_at: string
          import_id: string
          import_status: string
        }[]
      }
      release_expired_portal_account_claim: {
        Args: { p_claim_token: string; p_error: string; p_user_id: string }
        Returns: boolean
      }
      resolve_membermojo_portal_access_review: {
        Args: {
          p_actor_id: string
          p_decision: string
          p_membership_record_id: string
          p_reason: string
        }
        Returns: {
          membership_record_id: string
          portal_membership_status: string
          portal_user_id: string
          review_decision: string
        }[]
      }
      workbench_member_names: {
        Args: { p_user_ids: string[] }
        Returns: {
          full_name: string
          id: string
        }[]
      }
      record_workshop_email_attempt: {
        Args: { p_error?: string; p_reservation_id: number; p_sent: boolean }
        Returns: boolean
      }
      replace_donation_campaigns: {
        Args: { p_generic: Json; p_target: Json }
        Returns: undefined
      }
      replace_public_site_links: {
        Args: { p_affiliates: Json; p_socials: Json }
        Returns: undefined
      }
      reserve_workshop_place: {
        Args: { p_workshop_id: string }
        Returns: {
          available_places: number
          reservation_id: number
          reserved_places: number
        }[]
      }
      run_dashboard_retention: { Args: never; Returns: Json }
      run_dashboard_retention_core: { Args: never; Returns: Json }
      target_donation_total_pence: { Args: never; Returns: number }
      update_users: {
        Args: {
          user_avatar_url: string
          user_billing_address: Json
          user_birthday: string
          user_club_rules_agreement: boolean
          user_contact_number: string
          user_email: string
          user_full_name: string
          user_id: string
          user_title: string
        }
        Returns: undefined
      }
      workshop_reservation_counts: {
        Args: { p_workshop_ids: string[] }
        Returns: {
          reference_id: string
          reserved_count: number
        }[]
      }
    }
    Enums: {
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

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      event_type: ["member_only", "public"],
      feed_type: [
        "event",
        "user",
        "document",
        "workshop",
        "message",
        "broadcast",
      ],
      file_category: [
        "publication",
        "minute",
        "insurance-policy",
        "club-rule",
        "calendar",
        "boiler-guide",
        "others",
      ],
      pricing_plan_interval: ["day", "week", "month", "year"],
      pricing_type: ["one_time", "recurring"],
      subscription_status: [
        "trialing",
        "active",
        "canceled",
        "incomplete",
        "incomplete_expired",
        "past_due",
        "unpaid",
        "paused",
      ],
    },
  },
} as const
