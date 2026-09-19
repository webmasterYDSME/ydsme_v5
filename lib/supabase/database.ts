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
      administrative_actors: {
        Row: {
          auth_user_id: string | null
          created_at: string
          display_name: string
          ended_at: string | null
          id: string
          reference_code: string
          status: string
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          display_name: string
          ended_at?: string | null
          id?: string
          reference_code: string
          status?: string
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          display_name?: string
          ended_at?: string | null
          id?: string
          reference_code?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
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
          actor_id: string | null
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
          actor_id?: string | null
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
          actor_id?: string | null
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
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "administrative_actors"
            referencedColumns: ["id"]
          },
        ]
      }
      committees: {
        Row: {
          is_public: boolean
          position: number
          updated_at: string
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
          is_public?: boolean
          position?: number
          updated_at?: string
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
          is_public?: boolean
          position?: number
          updated_at?: string
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
          {
            foreignKeyName: "event_booking_abuse_summary_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "public_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_booking_abuse_summary_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "public_member_event_teasers"
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
          {
            foreignKeyName: "event_bookings_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "public_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_bookings_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "public_member_event_teasers"
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
      honorary_memberships: {
        Row: {
          created_at: string
          effective_from: string
          granted_at: string
          granted_by: string | null
          granted_by_actor_id: string | null
          id: string
          member_id: string
          reason: string
          replacement_plan_id: string | null
          revocation_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          revoked_by_actor_id: string | null
          revoked_effective_on: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          effective_from: string
          granted_at?: string
          granted_by?: string | null
          granted_by_actor_id?: string | null
          id?: string
          member_id: string
          reason: string
          replacement_plan_id?: string | null
          revocation_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          revoked_by_actor_id?: string | null
          revoked_effective_on?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          effective_from?: string
          granted_at?: string
          granted_by?: string | null
          granted_by_actor_id?: string | null
          id?: string
          member_id?: string
          reason?: string
          replacement_plan_id?: string | null
          revocation_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          revoked_by_actor_id?: string | null
          revoked_effective_on?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "honorary_memberships_granted_by_actor_id_fkey"
            columns: ["granted_by_actor_id"]
            isOneToOne: false
            referencedRelation: "administrative_actors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "honorary_memberships_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "honorary_memberships_replacement_plan_id_fkey"
            columns: ["replacement_plan_id"]
            isOneToOne: false
            referencedRelation: "membership_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "honorary_memberships_replacement_plan_id_fkey"
            columns: ["replacement_plan_id"]
            isOneToOne: false
            referencedRelation: "public_membership_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "honorary_memberships_revoked_by_actor_id_fkey"
            columns: ["revoked_by_actor_id"]
            isOneToOne: false
            referencedRelation: "administrative_actors"
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
      member_project_feature_requests: {
        Row: {
          owner_consented_at: string | null
          project_id: string
          review_note: string
          reviewed_at: string | null
          reviewed_by: string | null
          show_owner_name: boolean
          status: string
          submitted_at: string
          updated_at: string
        }
        Insert: {
          owner_consented_at?: string | null
          project_id: string
          review_note?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          show_owner_name?: boolean
          status?: string
          submitted_at?: string
          updated_at?: string
        }
        Update: {
          owner_consented_at?: string | null
          project_id?: string
          review_note?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          show_owner_name?: boolean
          status?: string
          submitted_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_project_feature_requests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "member_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_project_feature_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
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
      members: {
        Row: {
          anonymized_at: string | null
          auth_user_id: string | null
          contact_email: string | null
          contact_email_verified_at: string | null
          contact_number: string | null
          contact_role: string
          created_at: string
          current_plan_id: string | null
          date_of_birth: string | null
          effective_state: string
          full_name: string
          guardian_authority_ended_at: string | null
          guardian_consent_at: string | null
          guardian_consent_note: string | null
          guardian_email: string | null
          guardian_name: string | null
          id: string
          joined_on: string
          legacy_external_id: string | null
          legacy_membership_record_id: string | null
          legal_hold: boolean
          newsletter_opt_in: boolean
          newsletter_consent_given_on: string | null
          newsletter_consent_recorded_at: string | null
          newsletter_consent_recorded_by_actor_id: string | null
          newsletter_consent_source: string | null
          portal_invitation_status: string
          postal_address: Json | null
          preferred_contact_method: string
          retention_until: string | null
          source: string
          title: string
          updated_at: string
        }
        Insert: {
          anonymized_at?: string | null
          auth_user_id?: string | null
          contact_email?: string | null
          contact_email_verified_at?: string | null
          contact_number?: string | null
          contact_role?: string
          created_at?: string
          current_plan_id?: string | null
          date_of_birth?: string | null
          effective_state?: string
          full_name: string
          guardian_authority_ended_at?: string | null
          guardian_consent_at?: string | null
          guardian_consent_note?: string | null
          guardian_email?: string | null
          guardian_name?: string | null
          id?: string
          joined_on?: string
          legacy_external_id?: string | null
          legacy_membership_record_id?: string | null
          legal_hold?: boolean
          newsletter_opt_in?: boolean
          newsletter_consent_given_on?: string | null
          newsletter_consent_recorded_at?: string | null
          newsletter_consent_recorded_by_actor_id?: string | null
          newsletter_consent_source?: string | null
          portal_invitation_status?: string
          postal_address?: Json | null
          preferred_contact_method?: string
          retention_until?: string | null
          source?: string
          title?: string
          updated_at?: string
        }
        Update: {
          anonymized_at?: string | null
          auth_user_id?: string | null
          contact_email?: string | null
          contact_email_verified_at?: string | null
          contact_number?: string | null
          contact_role?: string
          created_at?: string
          current_plan_id?: string | null
          date_of_birth?: string | null
          effective_state?: string
          full_name?: string
          guardian_authority_ended_at?: string | null
          guardian_consent_at?: string | null
          guardian_consent_note?: string | null
          guardian_email?: string | null
          guardian_name?: string | null
          id?: string
          joined_on?: string
          legacy_external_id?: string | null
          legacy_membership_record_id?: string | null
          legal_hold?: boolean
          newsletter_opt_in?: boolean
          newsletter_consent_given_on?: string | null
          newsletter_consent_recorded_at?: string | null
          newsletter_consent_recorded_by_actor_id?: string | null
          newsletter_consent_source?: string | null
          portal_invitation_status?: string
          postal_address?: Json | null
          preferred_contact_method?: string
          retention_until?: string | null
          source?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "members_current_plan_id_fkey"
            columns: ["current_plan_id"]
            isOneToOne: false
            referencedRelation: "membership_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "members_current_plan_id_fkey"
            columns: ["current_plan_id"]
            isOneToOne: false
            referencedRelation: "public_membership_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "members_legacy_membership_record_id_fkey"
            columns: ["legacy_membership_record_id"]
            isOneToOne: true
            referencedRelation: "membership_records"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_applications: {
        Row: {
          application_status_expires_at: string | null
          application_status_token_hash: string | null
          auto_renew: boolean
          contact_email: string
          contact_number: string | null
          contact_role: string
          converted_member_id: string | null
          created_at: string
          date_of_birth: string | null
          email_verified_at: string | null
          expires_at: string
          full_name: string
          guardian_consent: boolean
          guardian_email: string | null
          guardian_led: boolean
          guardian_name: string | null
          guardian_verification_expires_at: string | null
          guardian_verification_token_hash: string | null
          guardian_verified_at: string | null
          id: string
          newsletter_opt_in: boolean
          payment_method: string
          payment_settings_version_id: string | null
          portal_invitation_status: string
          requested_plan_id: string
          retention_anonymized_at: string | null
          review_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewed_by_actor_id: string | null
          status: string
          student_declaration: boolean
          terms_accepted_at: string
          terms_version: string
          title: string
          updated_at: string
          verification_expires_at: string
          verification_token_hash: string
        }
        Insert: {
          application_status_expires_at?: string | null
          application_status_token_hash?: string | null
          auto_renew?: boolean
          contact_email: string
          contact_number?: string | null
          contact_role?: string
          converted_member_id?: string | null
          created_at?: string
          date_of_birth?: string | null
          email_verified_at?: string | null
          expires_at?: string
          full_name: string
          guardian_consent?: boolean
          guardian_email?: string | null
          guardian_led?: boolean
          guardian_name?: string | null
          guardian_verification_expires_at?: string | null
          guardian_verification_token_hash?: string | null
          guardian_verified_at?: string | null
          id?: string
          newsletter_opt_in?: boolean
          payment_method: string
          payment_settings_version_id?: string | null
          portal_invitation_status?: string
          requested_plan_id: string
          retention_anonymized_at?: string | null
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_actor_id?: string | null
          status?: string
          student_declaration?: boolean
          terms_accepted_at: string
          terms_version: string
          title?: string
          updated_at?: string
          verification_expires_at: string
          verification_token_hash: string
        }
        Update: {
          application_status_expires_at?: string | null
          application_status_token_hash?: string | null
          auto_renew?: boolean
          contact_email?: string
          contact_number?: string | null
          contact_role?: string
          converted_member_id?: string | null
          created_at?: string
          date_of_birth?: string | null
          email_verified_at?: string | null
          expires_at?: string
          full_name?: string
          guardian_consent?: boolean
          guardian_email?: string | null
          guardian_led?: boolean
          guardian_name?: string | null
          guardian_verification_expires_at?: string | null
          guardian_verification_token_hash?: string | null
          guardian_verified_at?: string | null
          id?: string
          newsletter_opt_in?: boolean
          payment_method?: string
          payment_settings_version_id?: string | null
          portal_invitation_status?: string
          requested_plan_id?: string
          retention_anonymized_at?: string | null
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_actor_id?: string | null
          status?: string
          student_declaration?: boolean
          terms_accepted_at?: string
          terms_version?: string
          title?: string
          updated_at?: string
          verification_expires_at?: string
          verification_token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_applications_converted_member_id_fkey"
            columns: ["converted_member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_applications_payment_settings_version_id_fkey"
            columns: ["payment_settings_version_id"]
            isOneToOne: false
            referencedRelation: "membership_payment_settings_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_applications_requested_plan_id_fkey"
            columns: ["requested_plan_id"]
            isOneToOne: false
            referencedRelation: "membership_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_applications_requested_plan_id_fkey"
            columns: ["requested_plan_id"]
            isOneToOne: false
            referencedRelation: "public_membership_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_applications_reviewed_by_actor_id_fkey"
            columns: ["reviewed_by_actor_id"]
            isOneToOne: false
            referencedRelation: "administrative_actors"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_checkout_attempts: {
        Row: {
          amount_pence: number
          application_id: string | null
          auto_renew: boolean
          completed_at: string | null
          created_at: string
          currency: string
          expires_at: string
          id: string
          last_error: string | null
          member_id: string | null
          membership_year: number
          plan_price_id: string
          purpose: string
          status: string
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
        }
        Insert: {
          amount_pence: number
          application_id?: string | null
          auto_renew?: boolean
          completed_at?: string | null
          created_at?: string
          currency?: string
          expires_at?: string
          id?: string
          last_error?: string | null
          member_id?: string | null
          membership_year: number
          plan_price_id: string
          purpose: string
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_pence?: number
          application_id?: string | null
          auto_renew?: boolean
          completed_at?: string | null
          created_at?: string
          currency?: string
          expires_at?: string
          id?: string
          last_error?: string | null
          member_id?: string | null
          membership_year?: number
          plan_price_id?: string
          purpose?: string
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_checkout_attempts_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "membership_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_checkout_attempts_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_checkout_attempts_plan_price_id_fkey"
            columns: ["plan_price_id"]
            isOneToOne: false
            referencedRelation: "membership_plan_prices"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_contact_change_requests: {
        Row: {
          application_id: string | null
          confirmed_at: string | null
          contact_kind: string
          created_at: string
          expires_at: string
          id: string
          member_id: string | null
          reason: string | null
          requested_by: string | null
          requested_by_actor_id: string | null
          requested_email: string
          requested_role: string | null
          status: string
          token_hash: string
          updated_at: string
        }
        Insert: {
          application_id?: string | null
          confirmed_at?: string | null
          contact_kind: string
          created_at?: string
          expires_at: string
          id?: string
          member_id?: string | null
          reason?: string | null
          requested_by?: string | null
          requested_by_actor_id?: string | null
          requested_email: string
          requested_role?: string | null
          status?: string
          token_hash: string
          updated_at?: string
        }
        Update: {
          application_id?: string | null
          confirmed_at?: string | null
          contact_kind?: string
          created_at?: string
          expires_at?: string
          id?: string
          member_id?: string | null
          reason?: string | null
          requested_by?: string | null
          requested_by_actor_id?: string | null
          requested_email?: string
          requested_role?: string | null
          status?: string
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_contact_change_requests_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "membership_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_contact_change_requests_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_contact_change_requests_requested_by_actor_id_fkey"
            columns: ["requested_by_actor_id"]
            isOneToOne: false
            referencedRelation: "administrative_actors"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_delivery_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          notification_id: string
          occurred_at: string
          provider_event_id: string | null
          provider_message_id: string | null
          safe_detail: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          notification_id: string
          occurred_at: string
          provider_event_id?: string | null
          provider_message_id?: string | null
          safe_detail?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          notification_id?: string
          occurred_at?: string
          provider_event_id?: string | null
          provider_message_id?: string | null
          safe_detail?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "membership_delivery_events_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "membership_notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_email_suppressions: {
        Row: {
          newsletter_suppressed: boolean
          normalized_email: string
          reason: string
          transactional_suppressed: boolean
          updated_at: string
        }
        Insert: {
          newsletter_suppressed?: boolean
          normalized_email: string
          reason: string
          transactional_suppressed?: boolean
          updated_at?: string
        }
        Update: {
          newsletter_suppressed?: boolean
          normalized_email?: string
          reason?: string
          transactional_suppressed?: boolean
          updated_at?: string
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
      membership_migration_reviews: {
        Row: {
          created_at: string
          id: string
          membership_record_id: string
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          review_group_key: string | null
          review_kind: string
          status: string
          summary: string
        }
        Insert: {
          created_at?: string
          id?: string
          membership_record_id: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          review_group_key?: string | null
          review_kind: string
          status?: string
          summary: string
        }
        Update: {
          created_at?: string
          id?: string
          membership_record_id?: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          review_group_key?: string | null
          review_kind?: string
          status?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_migration_reviews_membership_record_id_fkey"
            columns: ["membership_record_id"]
            isOneToOne: false
            referencedRelation: "membership_records"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_notifications: {
        Row: {
          action_href: string | null
          application_id: string | null
          body: string
          created_at: string
          deduplication_key: string
          email_attempts: number
          email_sent_at: string | null
          email_status: string
          id: string
          kind: string
          last_email_error: string | null
          member_id: string | null
          portal_visible: boolean
          provider_delivery_status: string | null
          provider_message_id: string | null
          read_at: string | null
          recipient_email: string | null
          recipient_user_id: string | null
          scheduled_for: string
          title: string
          updated_at: string
        }
        Insert: {
          action_href?: string | null
          application_id?: string | null
          body: string
          created_at?: string
          deduplication_key: string
          email_attempts?: number
          email_sent_at?: string | null
          email_status?: string
          id?: string
          kind: string
          last_email_error?: string | null
          member_id?: string | null
          portal_visible?: boolean
          provider_delivery_status?: string | null
          provider_message_id?: string | null
          read_at?: string | null
          recipient_email?: string | null
          recipient_user_id?: string | null
          scheduled_for?: string
          title: string
          updated_at?: string
        }
        Update: {
          action_href?: string | null
          application_id?: string | null
          body?: string
          created_at?: string
          deduplication_key?: string
          email_attempts?: number
          email_sent_at?: string | null
          email_status?: string
          id?: string
          kind?: string
          last_email_error?: string | null
          member_id?: string | null
          portal_visible?: boolean
          provider_delivery_status?: string | null
          provider_message_id?: string | null
          read_at?: string | null
          recipient_email?: string | null
          recipient_user_id?: string | null
          scheduled_for?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_notifications_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "membership_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_notifications_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_offline_payment_records: {
        Row: {
          application_id: string | null
          cleared_on: string | null
          created_at: string
          expected_amount_pence: number
          failure_reason: string | null
          id: string
          member_id: string | null
          method: string
          payment_reference: string | null
          received_on: string | null
          recorded_by_actor_id: string | null
          settings_version_id: string | null
          status: string
          term_id: string | null
          updated_at: string
        }
        Insert: {
          application_id?: string | null
          cleared_on?: string | null
          created_at?: string
          expected_amount_pence: number
          failure_reason?: string | null
          id?: string
          member_id?: string | null
          method: string
          payment_reference?: string | null
          received_on?: string | null
          recorded_by_actor_id?: string | null
          settings_version_id?: string | null
          status?: string
          term_id?: string | null
          updated_at?: string
        }
        Update: {
          application_id?: string | null
          cleared_on?: string | null
          created_at?: string
          expected_amount_pence?: number
          failure_reason?: string | null
          id?: string
          member_id?: string | null
          method?: string
          payment_reference?: string | null
          received_on?: string | null
          recorded_by_actor_id?: string | null
          settings_version_id?: string | null
          status?: string
          term_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_offline_payment_records_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "membership_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_offline_payment_records_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_offline_payment_records_recorded_by_actor_id_fkey"
            columns: ["recorded_by_actor_id"]
            isOneToOne: false
            referencedRelation: "administrative_actors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_offline_payment_records_settings_version_id_fkey"
            columns: ["settings_version_id"]
            isOneToOne: false
            referencedRelation: "membership_payment_settings_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_offline_payment_records_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "membership_terms"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_payment_settings_versions: {
        Row: {
          active: boolean
          bank_account_name: string
          bank_account_number: string
          bank_sort_code: string
          bank_transfer_instructions: string
          cash_instructions: string
          cheque_delivery_instructions: string
          cheque_payee: string
          configured: boolean
          created_at: string
          created_by_actor_id: string | null
          id: string
          treasurer_email: string
          treasurer_name: string
          treasurer_phone: string | null
          version: number
        }
        Insert: {
          active?: boolean
          bank_account_name: string
          bank_account_number: string
          bank_sort_code: string
          bank_transfer_instructions: string
          cash_instructions: string
          cheque_delivery_instructions: string
          cheque_payee: string
          configured?: boolean
          created_at?: string
          created_by_actor_id?: string | null
          id?: string
          treasurer_email: string
          treasurer_name: string
          treasurer_phone?: string | null
          version: number
        }
        Update: {
          active?: boolean
          bank_account_name?: string
          bank_account_number?: string
          bank_sort_code?: string
          bank_transfer_instructions?: string
          cash_instructions?: string
          cheque_delivery_instructions?: string
          cheque_payee?: string
          configured?: boolean
          created_at?: string
          created_by_actor_id?: string | null
          id?: string
          treasurer_email?: string
          treasurer_name?: string
          treasurer_phone?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "membership_payment_settings_versions_created_by_actor_id_fkey"
            columns: ["created_by_actor_id"]
            isOneToOne: false
            referencedRelation: "administrative_actors"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_payments: {
        Row: {
          amount_pence: number
          cash_receipt_reference: string | null
          cleared_at: string | null
          created_at: string
          currency: string
          id: string
          method: string
          notes: string | null
          offline_reference: string | null
          received_at: string | null
          received_by: string | null
          recorded_by_actor_id: string | null
          refunded_pence: number
          status: string
          stripe_charge_id: string | null
          stripe_checkout_session_id: string | null
          stripe_invoice_id: string | null
          stripe_payment_intent_id: string | null
          term_id: string
          updated_at: string
        }
        Insert: {
          amount_pence: number
          cash_receipt_reference?: string | null
          cleared_at?: string | null
          created_at?: string
          currency?: string
          id?: string
          method: string
          notes?: string | null
          offline_reference?: string | null
          received_at?: string | null
          received_by?: string | null
          recorded_by_actor_id?: string | null
          refunded_pence?: number
          status?: string
          stripe_charge_id?: string | null
          stripe_checkout_session_id?: string | null
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          term_id: string
          updated_at?: string
        }
        Update: {
          amount_pence?: number
          cash_receipt_reference?: string | null
          cleared_at?: string | null
          created_at?: string
          currency?: string
          id?: string
          method?: string
          notes?: string | null
          offline_reference?: string | null
          received_at?: string | null
          received_by?: string | null
          recorded_by_actor_id?: string | null
          refunded_pence?: number
          status?: string
          stripe_charge_id?: string | null
          stripe_checkout_session_id?: string | null
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          term_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_payments_recorded_by_actor_id_fkey"
            columns: ["recorded_by_actor_id"]
            isOneToOne: false
            referencedRelation: "administrative_actors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_payments_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "membership_terms"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_plan_prices: {
        Row: {
          active: boolean
          amount_pence: number
          carried_forward_from_id: string | null
          created_at: string
          created_by: string | null
          created_by_actor_id: string | null
          currency: string
          id: string
          membership_year: number
          plan_id: string
          stripe_price_id: string | null
          version: number
        }
        Insert: {
          active?: boolean
          amount_pence: number
          carried_forward_from_id?: string | null
          created_at?: string
          created_by?: string | null
          created_by_actor_id?: string | null
          currency?: string
          id?: string
          membership_year: number
          plan_id: string
          stripe_price_id?: string | null
          version?: number
        }
        Update: {
          active?: boolean
          amount_pence?: number
          carried_forward_from_id?: string | null
          created_at?: string
          created_by?: string | null
          created_by_actor_id?: string | null
          currency?: string
          id?: string
          membership_year?: number
          plan_id?: string
          stripe_price_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "membership_plan_prices_carried_forward_from_id_fkey"
            columns: ["carried_forward_from_id"]
            isOneToOne: false
            referencedRelation: "membership_plan_prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_plan_prices_created_by_actor_id_fkey"
            columns: ["created_by_actor_id"]
            isOneToOne: false
            referencedRelation: "administrative_actors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_plan_prices_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "membership_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_plan_prices_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "public_membership_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_plan_transitions: {
        Row: {
          created_at: string
          effective_on: string
          from_plan_id: string
          id: string
          member_id: string
          membership_year: number
          reason: string
          requested_at: string | null
          review_reason: string | null
          reviewed_at: string | null
          reviewed_by_actor_id: string | null
          status: string
          to_plan_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          effective_on: string
          from_plan_id: string
          id?: string
          member_id: string
          membership_year: number
          reason: string
          requested_at?: string | null
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by_actor_id?: string | null
          status?: string
          to_plan_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          effective_on?: string
          from_plan_id?: string
          id?: string
          member_id?: string
          membership_year?: number
          reason?: string
          requested_at?: string | null
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by_actor_id?: string | null
          status?: string
          to_plan_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_plan_transitions_from_plan_id_fkey"
            columns: ["from_plan_id"]
            isOneToOne: false
            referencedRelation: "membership_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_plan_transitions_from_plan_id_fkey"
            columns: ["from_plan_id"]
            isOneToOne: false
            referencedRelation: "public_membership_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_plan_transitions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_plan_transitions_reviewed_by_actor_id_fkey"
            columns: ["reviewed_by_actor_id"]
            isOneToOne: false
            referencedRelation: "administrative_actors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_plan_transitions_to_plan_id_fkey"
            columns: ["to_plan_id"]
            isOneToOne: false
            referencedRelation: "membership_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_plan_transitions_to_plan_id_fkey"
            columns: ["to_plan_id"]
            isOneToOne: false
            referencedRelation: "public_membership_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_plans: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          created_by_actor_id: string | null
          description: string
          id: string
          maximum_age: number
          minimum_age: number
          name: string
          requires_approval: boolean
          slug: string
          sort_order: number
          stripe_product_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          created_by_actor_id?: string | null
          description?: string
          id?: string
          maximum_age: number
          minimum_age: number
          name: string
          requires_approval?: boolean
          slug: string
          sort_order?: number
          stripe_product_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          created_by_actor_id?: string | null
          description?: string
          id?: string
          maximum_age?: number
          minimum_age?: number
          name?: string
          requires_approval?: boolean
          slug?: string
          sort_order?: number
          stripe_product_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_plans_created_by_actor_id_fkey"
            columns: ["created_by_actor_id"]
            isOneToOne: false
            referencedRelation: "administrative_actors"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_provider_commands: {
        Row: {
          attempts: number
          checkout_attempt_id: string | null
          claimed_at: string | null
          command_type: string
          completed_at: string | null
          created_at: string
          id: string
          idempotency_key: string
          last_error: string | null
          member_id: string | null
          next_attempt_at: string
          payload: Json
          status: string
          stripe_subscription_id: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          checkout_attempt_id?: string | null
          claimed_at?: string | null
          command_type: string
          completed_at?: string | null
          created_at?: string
          id?: string
          idempotency_key: string
          last_error?: string | null
          member_id?: string | null
          next_attempt_at?: string
          payload?: Json
          status?: string
          stripe_subscription_id: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          checkout_attempt_id?: string | null
          claimed_at?: string | null
          command_type?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string
          last_error?: string | null
          member_id?: string | null
          next_attempt_at?: string
          payload?: Json
          status?: string
          stripe_subscription_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_provider_commands_checkout_attempt_id_fkey"
            columns: ["checkout_attempt_id"]
            isOneToOne: false
            referencedRelation: "membership_checkout_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_provider_commands_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
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
      membership_report_exports: {
        Row: {
          completed_at: string | null
          created_at: string
          expires_at: string | null
          filters: Json
          financial_totals: Json | null
          id: string
          last_error: string | null
          requested_by_actor_id: string
          row_counts: Json | null
          status: string
          storage_path: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          expires_at?: string | null
          filters?: Json
          financial_totals?: Json | null
          id?: string
          last_error?: string | null
          requested_by_actor_id: string
          row_counts?: Json | null
          status?: string
          storage_path?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          expires_at?: string | null
          filters?: Json
          financial_totals?: Json | null
          id?: string
          last_error?: string | null
          requested_by_actor_id?: string
          row_counts?: Json | null
          status?: string
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "membership_report_exports_requested_by_actor_id_fkey"
            columns: ["requested_by_actor_id"]
            isOneToOne: false
            referencedRelation: "administrative_actors"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          member_id: string
          next_charge_at: string | null
          status: string
          stripe_customer_id: string
          stripe_event_created_at: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string
          updated_at: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          member_id: string
          next_charge_at?: string | null
          status: string
          stripe_customer_id: string
          stripe_event_created_at?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id: string
          updated_at?: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          member_id?: string
          next_charge_at?: string | null
          status?: string
          stripe_customer_id?: string
          stripe_event_created_at?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_subscriptions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_terms: {
        Row: {
          amount_due_pence: number
          amount_paid_pence: number
          application_id: string | null
          created_at: string
          created_by_actor_id: string | null
          ends_on: string
          expected_payment_method: string | null
          grace_ends_on: string
          id: string
          member_id: string
          membership_year: number
          plan_price_id: string
          source: string
          starts_on: string
          status: string
          updated_at: string
        }
        Insert: {
          amount_due_pence: number
          amount_paid_pence?: number
          application_id?: string | null
          created_at?: string
          created_by_actor_id?: string | null
          ends_on: string
          expected_payment_method?: string | null
          grace_ends_on: string
          id?: string
          member_id: string
          membership_year: number
          plan_price_id: string
          source: string
          starts_on: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount_due_pence?: number
          amount_paid_pence?: number
          application_id?: string | null
          created_at?: string
          created_by_actor_id?: string | null
          ends_on?: string
          expected_payment_method?: string | null
          grace_ends_on?: string
          id?: string
          member_id?: string
          membership_year?: number
          plan_price_id?: string
          source?: string
          starts_on?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_terms_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "membership_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_terms_created_by_actor_id_fkey"
            columns: ["created_by_actor_id"]
            isOneToOne: false
            referencedRelation: "administrative_actors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_terms_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_terms_plan_price_id_fkey"
            columns: ["plan_price_id"]
            isOneToOne: false
            referencedRelation: "membership_plan_prices"
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
      public_featured_project_photos: {
        Row: {
          caption: string
          id: string
          sort_order: number
          storage_path: string
          update_id: string
        }
        Insert: {
          caption?: string
          id: string
          sort_order: number
          storage_path: string
          update_id: string
        }
        Update: {
          caption?: string
          id?: string
          sort_order?: number
          storage_path?: string
          update_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_featured_project_photos_update_id_fkey"
            columns: ["update_id"]
            isOneToOne: false
            referencedRelation: "public_featured_project_updates"
            referencedColumns: ["id"]
          },
        ]
      }
      public_featured_project_updates: {
        Row: {
          body: string
          created_at: string
          help_type: string | null
          id: string
          project_id: string
          sort_order: number
          title: string
        }
        Insert: {
          body: string
          created_at: string
          help_type?: string | null
          id: string
          project_id: string
          sort_order: number
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          help_type?: string | null
          id?: string
          project_id?: string
          sort_order?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_featured_project_updates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_featured_projects"
            referencedColumns: ["project_id"]
          },
        ]
      }
      public_featured_projects: {
        Row: {
          category: string
          completed_at: string
          cover_image_path: string | null
          owner_byline: string
          project_id: string
          published_at: string
          slug: string
          summary: string
          title: string
        }
        Insert: {
          category: string
          completed_at: string
          cover_image_path?: string | null
          owner_byline: string
          project_id: string
          published_at?: string
          slug: string
          summary: string
          title: string
        }
        Update: {
          category?: string
          completed_at?: string
          cover_image_path?: string | null
          owner_byline?: string
          project_id?: string
          published_at?: string
          slug?: string
          summary?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_featured_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "member_projects"
            referencedColumns: ["id"]
          },
        ]
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
          processed_at: string
          processing_status: string
          stripe_event_id: string
        }
        Insert: {
          claimed_at?: string | null
          completed_at?: string | null
          event_type: string
          last_error?: string | null
          processed_at?: string
          processing_status?: string
          stripe_event_id: string
        }
        Update: {
          claimed_at?: string | null
          completed_at?: string | null
          event_type?: string
          last_error?: string | null
          processed_at?: string
          processing_status?: string
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
      user_capabilities: {
        Row: {
          capability: string
          granted_at: string
          granted_by: string | null
          granted_by_actor_id: string | null
          user_id: string
        }
        Insert: {
          capability: string
          granted_at?: string
          granted_by?: string | null
          granted_by_actor_id?: string | null
          user_id: string
        }
        Update: {
          capability?: string
          granted_at?: string
          granted_by?: string | null
          granted_by_actor_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_capabilities_granted_by_actor_id_fkey"
            columns: ["granted_by_actor_id"]
            isOneToOne: false
            referencedRelation: "administrative_actors"
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
        Insert: {
          body?: string | null
          id?: number | null
          published_at?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          body?: string | null
          id?: number | null
          published_at?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      public_committee_roster: {
        Row: {
          position: number | null
          email: string | null
          file_url: string | null
          id: number | null
          name: string | null
          title: string | null
        }
        Insert: {
          email?: string | null
          file_url?: string | null
          id?: number | null
          name?: string | null
          title?: string | null
        }
        Update: {
          email?: string | null
          file_url?: string | null
          id?: number | null
          name?: string | null
          title?: string | null
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
        Insert: {
          booking_capacity?: number | null
          booking_enabled?: boolean | null
          booking_mode?: string | null
          descriptions?: string | null
          display_in_homepage?: boolean | null
          end_date?: string | null
          end_time?: string | null
          event_type?: Database["public"]["Enums"]["event_type"] | null
          file_url?: string | null
          id?: number | null
          is_ticket_required?: boolean | null
          lifecycle_status?: string | null
          name?: string | null
          reservation_link?: string | null
          start_date?: string | null
          start_time?: string | null
        }
        Update: {
          booking_capacity?: number | null
          booking_enabled?: boolean | null
          booking_mode?: string | null
          descriptions?: string | null
          display_in_homepage?: boolean | null
          end_date?: string | null
          end_time?: string | null
          event_type?: Database["public"]["Enums"]["event_type"] | null
          file_url?: string | null
          id?: number | null
          is_ticket_required?: boolean | null
          lifecycle_status?: string | null
          name?: string | null
          reservation_link?: string | null
          start_date?: string | null
          start_time?: string | null
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
        Insert: {
          descriptions?: string | null
          end_date?: string | null
          end_time?: string | null
          file_url?: string | null
          id?: number | null
          name?: string | null
          start_date?: string | null
          start_time?: string | null
        }
        Update: {
          descriptions?: string | null
          end_date?: string | null
          end_time?: string | null
          file_url?: string | null
          id?: number | null
          name?: string | null
          start_date?: string | null
          start_time?: string | null
        }
        Relationships: []
      }
      public_membership_plans: {
        Row: {
          amount_pence: number | null
          currency: string | null
          description: string | null
          id: string | null
          maximum_age: number | null
          membership_year: number | null
          minimum_age: number | null
          name: string | null
          requires_approval: boolean | null
          slug: string | null
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
        Insert: {
          body?: string | null
          id?: number | null
          published_at?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          body?: string | null
          id?: number | null
          published_at?: string | null
          title?: string | null
          updated_at?: string | null
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
    }
    Functions: {
      activate_membership_application: {
        Args: {
          p_actor_id?: string
          p_amount_pence: number
          p_application_id: string
          p_cancel_at_period_end?: boolean
          p_cash_receipt_reference?: string
          p_current_period_end?: string
          p_method: string
          p_plan_price_id: string
          p_stripe_checkout_session_id?: string
          p_stripe_customer_id?: string
          p_stripe_invoice_id?: string
          p_stripe_payment_intent_id?: string
          p_stripe_subscription_id?: string
          p_stripe_subscription_status?: string
        }
        Returns: {
          member_id: string
          payment_id: string
          term_id: string
        }[]
      }
      activate_membership_renewal: {
        Args: {
          p_actor_id?: string
          p_amount_pence: number
          p_cancel_at_period_end?: boolean
          p_cash_receipt_reference?: string
          p_current_period_end?: string
          p_current_period_start?: string
          p_member_id: string
          p_membership_year: number
          p_method: string
          p_paid_on: string
          p_plan_price_id: string
          p_stripe_checkout_session_id?: string
          p_stripe_customer_id?: string
          p_stripe_event_created_at?: string
          p_stripe_invoice_id?: string
          p_stripe_payment_intent_id?: string
          p_stripe_subscription_id?: string
          p_stripe_subscription_status?: string
        }
        Returns: {
          member_id: string
          payment_id: string
          term_id: string
        }[]
      }
      activate_offline_membership_application: {
        Args: {
          p_actor_id: string
          p_amount_pence: number
          p_application_id: string
          p_payment_reference: string
          p_plan_price_id: string
          p_received_on: string
        }
        Returns: {
          member_id: string
          payment_id: string
          term_id: string
        }[]
      }
      activate_offline_membership_renewal: {
        Args: {
          p_actor_id: string
          p_amount_pence: number
          p_member_id: string
          p_membership_year: number
          p_method: string
          p_payment_reference: string
          p_plan_price_id: string
          p_received_on: string
        }
        Returns: {
          member_id: string
          payment_id: string
          term_id: string
        }[]
      }
      anonymize_member_content_for_purge: {
        Args: { p_actor_id?: string; p_claim_token?: string; p_user_id: string }
        Returns: boolean
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
      apply_membership_plan_transitions: {
        Args: { p_today?: string }
        Returns: number
      }
      approve_public_project_feature: {
        Args: {
          p_cover_image_path?: string
          p_photo_paths?: Json
          p_project_id: string
          p_review_note?: string
        }
        Returns: string
      }
      archive_past_events: { Args: never; Returns: number }
      archive_past_workshops: { Args: never; Returns: number }
      attach_membership_checkout_session: {
        Args: {
          p_attempt_id: string
          p_expires_at: string
          p_stripe_checkout_session_id: string
        }
        Returns: boolean
      }
      booking_management_summary: {
        Args: { p_event_id?: number }
        Returns: Json
      }
      cancel_workshop_place: {
        Args: { p_workshop_id: string }
        Returns: boolean
      }
      claim_expired_portal_accounts: {
        Args: { p_limit?: number }
        Returns: {
          claim_token: string
          user_id: string
        }[]
      }
      claim_membership_notifications: {
        Args: { p_limit?: number }
        Returns: {
          action_href: string
          body: string
          email_attempts: number
          kind: string
          member_id: string
          notification_id: string
          recipient_email: string
          title: string
        }[]
      }
      claim_membership_provider_commands: {
        Args: { p_limit?: number; p_member_id?: string }
        Returns: {
          command_id: string
          command_type: string
          idempotency_key: string
          payload: Json
          stripe_subscription_id: string
        }[]
      }
      claim_membership_report_export: {
        Args: never
        Returns: {
          export_id: string
          filters: Json
        }[]
      }
      complete_membership_notification: {
        Args: {
          p_error?: string
          p_notification_id: string
          p_provider_message_id?: string
          p_sent: boolean
        }
        Returns: boolean
      }
      complete_membership_provider_command: {
        Args: {
          p_command_id: string
          p_safe_error?: string
          p_succeeded: boolean
        }
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
          p_device_hash: string
          p_email: string
          p_event_id: number
          p_ip_hash: string
          p_lead_name: string
          p_party_size: number
          p_reference_code: string
        }
        Returns: {
          available_places: number
          block_reason: string
          booking_id: string
          outcome: string
          reference_code: string
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
      create_officer_managed_membership: {
        Args: {
          p_actor_id: string
          p_contact_email?: string
          p_contact_number?: string
          p_date_of_birth: string
          p_duplicate_override_reason?: string
          p_full_name: string
          p_guardian_consent_note?: string
          p_guardian_email?: string
          p_guardian_name?: string
          p_newsletter_consent_given_on?: string
          p_newsletter_consent_source?: string
          p_newsletter_opt_in?: boolean
          p_payment_method: string
          p_payment_received: boolean
          p_payment_reference: string
          p_plan_id: string
          p_postal_address?: Json
          p_received_on: string
          p_student_declaration?: boolean
          p_title?: string
        }
        Returns: {
          member_id: string
          payment_id: string
          term_id: string
        }[]
      }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      dashboard_feed_snapshot: { Args: { p_limit?: number }; Returns: Json }
      donation_management_summary: {
        Args: { p_from?: string; p_until?: string }
        Returns: Json
      }
      ensure_administrative_actor: {
        Args: { p_auth_user_id: string }
        Returns: string
      }
      ensure_membership_plan_price: {
        Args: { p_membership_year: number; p_plan_id: string }
        Returns: {
          active: boolean
          amount_pence: number
          carried_forward_from_id: string
          currency: string
          id: string
          membership_year: number
          plan_id: string
          stripe_price_id: string
          version: number
        }[]
      }
      execute_membermojo_final_membership_cutover: {
        Args: { p_actor_id: string }
        Returns: Json
      }
      expire_membership_applications: { Args: never; Returns: number }
      get_own_membership_notifications: {
        Args: { p_limit?: number }
        Returns: {
          action_href: string
          body: string
          created_at: string
          id: string
          kind: string
          read_at: string
          title: string
        }[]
      }
      get_own_member_details: { Args: never; Returns: Json }
      get_own_newsletter_preference: { Args: never; Returns: Json }
      grant_lifetime_honorary_membership: {
        Args: {
          p_actor_id: string
          p_effective_from: string
          p_member_id: string
          p_reason: string
        }
        Returns: string
      }
      has_app_role: { Args: { allowed_roles: string[] }; Returns: boolean }
      has_membership_management_capability: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      is_active_member: { Args: never; Returns: boolean }
      mark_membership_payment_reversal: {
        Args: {
          p_disputed: boolean
          p_refunded_pence: number
          p_stripe_charge_id: string
          p_stripe_event_id: string
          p_stripe_payment_intent_id: string
        }
        Returns: string
      }
      mark_own_membership_notification_read: {
        Args: { p_notification_id: string }
        Returns: boolean
      }
      membership_age_on: {
        Args: { p_date_of_birth: string; p_on_date: string }
        Returns: number
      }
      membership_billing_year: { Args: { p_on_date: string }; Returns: number }
      own_archived_notices: {
        Args: { p_limit?: number }
        Returns: {
          id: number
          title: string
        }[]
      }
      prepare_membership_age_transitions: {
        Args: { p_membership_year: number }
        Returns: number
      }
      prorated_membership_fee_pence: {
        Args: { p_annual_pence: number; p_on_date: string }
        Returns: number
      }
      reconcile_membership_invoice: {
        Args: {
          p_amount_paid_pence: number
          p_event_created_at: string
          p_paid: boolean
          p_stripe_charge_id: string
          p_stripe_invoice_id: string
          p_stripe_payment_intent_id: string
          p_stripe_subscription_id: string
        }
        Returns: string
      }
      reconcile_membership_subscription:
        | {
            Args: {
              p_cancel_at_period_end: boolean
              p_current_period_end: string
              p_current_period_start: string
              p_status: string
              p_stripe_price_id: string
              p_stripe_subscription_id: string
            }
            Returns: string
          }
        | {
            Args: {
              p_cancel_at_period_end: boolean
              p_current_period_end: string
              p_current_period_start: string
              p_event_created_at: string
              p_status: string
              p_stripe_price_id: string
              p_stripe_subscription_id: string
            }
            Returns: string
          }
      record_event_booking_email_attempt: {
        Args: { p_booking_id: string; p_error: string; p_sent: boolean }
        Returns: boolean
      }
      record_membership_delivery_event: {
        Args: {
          p_event_type: string
          p_occurred_at: string
          p_provider_event_id: string
          p_provider_message_id: string
          p_safe_detail: string
        }
        Returns: string
      }
      record_offline_application_payment: {
        Args: {
          p_actor_id: string
          p_application_id: string
          p_event: string
          p_payment_reference: string
          p_reason: string
          p_received_on: string
        }
        Returns: string
      }
      record_workshop_email_attempt: {
        Args: { p_error?: string; p_reservation_id: number; p_sent: boolean }
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
      reject_public_project_feature: {
        Args: { p_project_id: string; p_review_note?: string }
        Returns: boolean
      }
      release_expired_portal_account_claim: {
        Args: { p_claim_token: string; p_error: string; p_user_id: string }
        Returns: boolean
      }
      replace_donation_campaigns: {
        Args: { p_generic: Json; p_target: Json }
        Returns: undefined
      }
      replace_membership_payment_settings: {
        Args: {
          p_actor_id: string
          p_bank_account_name: string
          p_bank_account_number: string
          p_bank_sort_code: string
          p_bank_transfer_instructions: string
          p_cash_instructions: string
          p_cheque_delivery_instructions: string
          p_cheque_payee: string
          p_treasurer_email: string
          p_treasurer_name: string
          p_treasurer_phone: string
        }
        Returns: string
      }
      replace_public_site_links: {
        Args: { p_affiliates: Json; p_socials: Json }
        Returns: undefined
      }
      report_offline_membership_payment_failure: {
        Args: { p_actor_id: string; p_payment_id: string; p_reason: string }
        Returns: string
      }
      request_membership_automation: {
        Args: { p_job: string }
        Returns: number
      }
      request_membership_notification_delivery: { Args: never; Returns: number }
      request_membership_report_generation: { Args: never; Returns: boolean }
      request_own_student_membership: {
        Args: { p_membership_year: number }
        Returns: string
      }
      request_public_project_feature: {
        Args: { p_project_id: string; p_show_owner_name?: boolean }
        Returns: string
      }
      reserve_membership_checkout_attempt: {
        Args: {
          p_amount_pence: number
          p_application_id: string
          p_auto_renew: boolean
          p_member_id: string
          p_membership_year: number
          p_plan_price_id: string
          p_purpose: string
        }
        Returns: {
          attempt_created: boolean
          attempt_id: string
          attempt_status: string
          stripe_checkout_session_id: string
        }[]
      }
      reserve_workshop_place: {
        Args: { p_workshop_id: string }
        Returns: {
          available_places: number
          reservation_id: number
          reserved_places: number
        }[]
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
      resolve_membership_payment_review: {
        Args: {
          p_actor_id: string
          p_reason: string
          p_resolution: string
          p_term_id: string
        }
        Returns: boolean
      }
      review_student_membership_request: {
        Args: {
          p_actor_id: string
          p_approved: boolean
          p_reason: string
          p_transition_id: string
        }
        Returns: boolean
      }
      revoke_lifetime_honorary_membership: {
        Args: {
          p_actor_id: string
          p_effective_on: string
          p_honorary_id: string
          p_reason: string
          p_replacement_plan_id: string
        }
        Returns: boolean
      }
      roll_forward_membership_plan_prices: {
        Args: { p_membership_year?: number }
        Returns: number
      }
      run_dashboard_retention: { Args: never; Returns: Json }
      run_dashboard_retention_core: { Args: never; Returns: Json }
      run_membership_daily: { Args: { p_today?: string }; Returns: Json }
      run_membership_launch_retention: {
        Args: { p_today?: string }
        Returns: Json
      }
      set_own_newsletter_preference: { Args: { p_subscribe: boolean }; Returns: Json }
      stage_membermojo_membership_cutover: {
        Args: { p_actor_id: string }
        Returns: Json
      }
      target_donation_total_pence: { Args: never; Returns: number }
      update_own_member_details: {
        Args: {
          p_address_line_one: string
          p_address_line_two: string
          p_city: string
          p_date_of_birth?: string
          p_postcode: string
        }
        Returns: undefined
      }
      update_own_member_profile: {
        Args: { p_contact_number: string; p_full_name: string; p_title: string }
        Returns: undefined
      }
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
      withdraw_public_project_feature: {
        Args: { p_project_id: string }
        Returns: boolean
      }
      workbench_member_names: {
        Args: { p_user_ids: string[] }
        Returns: {
          full_name: string
          id: string
        }[]
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
