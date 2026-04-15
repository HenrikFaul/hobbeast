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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      account_deletions: {
        Row: {
          account_created_at: string | null
          deleted_at: string
          deletion_reason: string
          email: string
          id: string
          user_id: string
        }
        Insert: {
          account_created_at?: string | null
          deleted_at?: string
          deletion_reason: string
          email: string
          id?: string
          user_id: string
        }
        Update: {
          account_created_at?: string | null
          deleted_at?: string
          deletion_reason?: string
          email?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      auto_event_config: {
        Row: {
          categories_filter: string[] | null
          created_at: string
          enabled: boolean
          frequency_days: number
          id: string
          last_run_at: string | null
          last_run_result: Json | null
          max_distance_km: number
          max_events_per_run: number
          min_members: number
          updated_at: string
        }
        Insert: {
          categories_filter?: string[] | null
          created_at?: string
          enabled?: boolean
          frequency_days?: number
          id?: string
          last_run_at?: string | null
          last_run_result?: Json | null
          max_distance_km?: number
          max_events_per_run?: number
          min_members?: number
          updated_at?: string
        }
        Update: {
          categories_filter?: string[] | null
          created_at?: string
          enabled?: boolean
          frequency_days?: number
          id?: string
          last_run_at?: string | null
          last_run_result?: Json | null
          max_distance_km?: number
          max_events_per_run?: number
          min_members?: number
          updated_at?: string
        }
        Relationships: []
      }
      event_messages: {
        Row: {
          actor_user_id: string
          audience_filter: string
          body: string
          created_at: string
          delivery_state: string
          event_id: string
          id: string
          message_type: string
          scheduled_for: string | null
          subject: string | null
        }
        Insert: {
          actor_user_id: string
          audience_filter: string
          body: string
          created_at?: string
          delivery_state?: string
          event_id: string
          id?: string
          message_type: string
          scheduled_for?: string | null
          subject?: string | null
        }
        Update: {
          actor_user_id?: string
          audience_filter?: string
          body?: string
          created_at?: string
          delivery_state?: string
          event_id?: string
          id?: string
          message_type?: string
          scheduled_for?: string | null
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_messages_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_participants: {
        Row: {
          checked_in_at: string | null
          event_id: string
          id: string
          invite_code: string | null
          joined_at: string
          organizer_note: string | null
          status: string
          status_updated_at: string | null
          user_id: string
        }
        Insert: {
          checked_in_at?: string | null
          event_id: string
          id?: string
          invite_code?: string | null
          joined_at?: string
          organizer_note?: string | null
          status?: string
          status_updated_at?: string | null
          user_id: string
        }
        Update: {
          checked_in_at?: string | null
          event_id?: string
          id?: string
          invite_code?: string | null
          joined_at?: string
          organizer_note?: string | null
          status?: string
          status_updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_participants_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_templates: {
        Row: {
          category: string
          created_at: string
          description: string | null
          event_time: string | null
          id: string
          image_emoji: string | null
          location_address: string | null
          location_city: string | null
          location_district: string | null
          location_free_text: string | null
          location_type: string | null
          max_attendees: number | null
          tags: string[] | null
          template_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          event_time?: string | null
          id?: string
          image_emoji?: string | null
          location_address?: string | null
          location_city?: string | null
          location_district?: string | null
          location_free_text?: string | null
          location_type?: string | null
          max_attendees?: number | null
          tags?: string[] | null
          template_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          event_time?: string | null
          id?: string
          image_emoji?: string | null
          location_address?: string | null
          location_city?: string | null
          location_district?: string | null
          location_free_text?: string | null
          location_type?: string | null
          max_attendees?: number | null
          tags?: string[] | null
          template_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      event_trip_plans: {
        Row: {
          created_at: string
          duration_s: number | null
          elevation_profile: Json | null
          elevation_summary: Json | null
          end_point: Json
          event_id: string
          external_url: string | null
          geometry: Json | null
          id: string
          length_m: number | null
          provider: string
          route_type: string
          start_point: Json
          updated_at: string
          warnings: Json | null
          waypoints: Json | null
        }
        Insert: {
          created_at?: string
          duration_s?: number | null
          elevation_profile?: Json | null
          elevation_summary?: Json | null
          end_point: Json
          event_id: string
          external_url?: string | null
          geometry?: Json | null
          id?: string
          length_m?: number | null
          provider?: string
          route_type?: string
          start_point: Json
          updated_at?: string
          warnings?: Json | null
          waypoints?: Json | null
        }
        Update: {
          created_at?: string
          duration_s?: number | null
          elevation_profile?: Json | null
          elevation_summary?: Json | null
          end_point?: Json
          event_id?: string
          external_url?: string | null
          geometry?: Json | null
          id?: string
          length_m?: number | null
          provider?: string
          route_type?: string
          start_point?: Json
          updated_at?: string
          warnings?: Json | null
          waypoints?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "event_trip_plans_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          category: string
          created_at: string
          created_by: string
          description: string | null
          event_date: string | null
          event_time: string | null
          id: string
          image_emoji: string | null
          is_active: boolean
          location_address: string | null
          location_city: string | null
          location_district: string | null
          location_free_text: string | null
          location_lat: number | null
          location_lon: number | null
          location_type: string | null
          max_attendees: number | null
          participation_type: string | null
          place_address: string | null
          place_categories: string[] | null
          place_category_confidence: number | null
          place_city: string | null
          place_country: string | null
          place_details: Json | null
          place_diagnostics: Json | null
          place_distance_m: number | null
          place_lat: number | null
          place_lon: number | null
          place_name: string | null
          place_postcode: string | null
          place_source: string | null
          place_source_ids: Json | null
          tags: string[] | null
          title: string
          updated_at: string
          visibility_type: string | null
          waitlist_enabled: boolean | null
        }
        Insert: {
          category: string
          created_at?: string
          created_by: string
          description?: string | null
          event_date?: string | null
          event_time?: string | null
          id?: string
          image_emoji?: string | null
          is_active?: boolean
          location_address?: string | null
          location_city?: string | null
          location_district?: string | null
          location_free_text?: string | null
          location_lat?: number | null
          location_lon?: number | null
          location_type?: string | null
          max_attendees?: number | null
          participation_type?: string | null
          place_address?: string | null
          place_categories?: string[] | null
          place_category_confidence?: number | null
          place_city?: string | null
          place_country?: string | null
          place_details?: Json | null
          place_diagnostics?: Json | null
          place_distance_m?: number | null
          place_lat?: number | null
          place_lon?: number | null
          place_name?: string | null
          place_postcode?: string | null
          place_source?: string | null
          place_source_ids?: Json | null
          tags?: string[] | null
          title: string
          updated_at?: string
          visibility_type?: string | null
          waitlist_enabled?: boolean | null
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string
          description?: string | null
          event_date?: string | null
          event_time?: string | null
          id?: string
          image_emoji?: string | null
          is_active?: boolean
          location_address?: string | null
          location_city?: string | null
          location_district?: string | null
          location_free_text?: string | null
          location_lat?: number | null
          location_lon?: number | null
          location_type?: string | null
          max_attendees?: number | null
          participation_type?: string | null
          place_address?: string | null
          place_categories?: string[] | null
          place_category_confidence?: number | null
          place_city?: string | null
          place_country?: string | null
          place_details?: Json | null
          place_diagnostics?: Json | null
          place_distance_m?: number | null
          place_lat?: number | null
          place_lon?: number | null
          place_name?: string | null
          place_postcode?: string | null
          place_source?: string | null
          place_source_ids?: Json | null
          tags?: string[] | null
          title?: string
          updated_at?: string
          visibility_type?: string | null
          waitlist_enabled?: boolean | null
        }
        Relationships: []
      }
      external_events: {
        Row: {
          category: string | null
          created_at: string
          currency: string | null
          description: string | null
          event_date: string | null
          event_time: string | null
          external_id: string
          external_source: string
          external_url: string | null
          id: string
          image_url: string | null
          is_active: boolean
          is_free: boolean | null
          location_address: string | null
          location_city: string | null
          location_free_text: string | null
          location_lat: number | null
          location_lon: number | null
          location_type: string | null
          max_attendees: number | null
          organizer_name: string | null
          price_max: number | null
          price_min: number | null
          source_last_synced_at: string | null
          source_payload: Json | null
          subcategory: string | null
          tags: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          currency?: string | null
          description?: string | null
          event_date?: string | null
          event_time?: string | null
          external_id: string
          external_source: string
          external_url?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_free?: boolean | null
          location_address?: string | null
          location_city?: string | null
          location_free_text?: string | null
          location_lat?: number | null
          location_lon?: number | null
          location_type?: string | null
          max_attendees?: number | null
          organizer_name?: string | null
          price_max?: number | null
          price_min?: number | null
          source_last_synced_at?: string | null
          source_payload?: Json | null
          subcategory?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          currency?: string | null
          description?: string | null
          event_date?: string | null
          event_time?: string | null
          external_id?: string
          external_source?: string
          external_url?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_free?: boolean | null
          location_address?: string | null
          location_city?: string | null
          location_free_text?: string | null
          location_lat?: number | null
          location_lon?: number | null
          location_type?: string | null
          max_attendees?: number | null
          organizer_name?: string | null
          price_max?: number | null
          price_min?: number | null
          source_last_synced_at?: string | null
          source_payload?: Json | null
          subcategory?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      hike_routes: {
        Row: {
          created_at: string
          created_by: string
          elevation_profile: Json | null
          event_id: string | null
          geometry: Json | null
          id: string
          name: string
          route_type: string
          total_ascent_m: number | null
          total_descent_m: number | null
          total_distance_m: number | null
          total_duration_s: number | null
          updated_at: string
          waypoints: Json
        }
        Insert: {
          created_at?: string
          created_by: string
          elevation_profile?: Json | null
          event_id?: string | null
          geometry?: Json | null
          id?: string
          name?: string
          route_type?: string
          total_ascent_m?: number | null
          total_descent_m?: number | null
          total_distance_m?: number | null
          total_duration_s?: number | null
          updated_at?: string
          waypoints?: Json
        }
        Update: {
          created_at?: string
          created_by?: string
          elevation_profile?: Json | null
          event_id?: string | null
          geometry?: Json | null
          id?: string
          name?: string
          route_type?: string
          total_ascent_m?: number | null
          total_descent_m?: number | null
          total_distance_m?: number | null
          total_duration_s?: number | null
          updated_at?: string
          waypoints?: Json
        }
        Relationships: [
          {
            foreignKeyName: "hike_routes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      hobby_activities: {
        Row: {
          age_restriction: string | null
          can_be_online: boolean | null
          created_at: string
          emoji: string | null
          group_size_max: number | null
          group_size_min: number | null
          id: string
          is_active: boolean
          is_team_based: boolean | null
          keywords: string[] | null
          name: string
          physical_intensity: string | null
          slug: string
          sort_order: number
          subcategory_id: string
          updated_at: string
        }
        Insert: {
          age_restriction?: string | null
          can_be_online?: boolean | null
          created_at?: string
          emoji?: string | null
          group_size_max?: number | null
          group_size_min?: number | null
          id?: string
          is_active?: boolean
          is_team_based?: boolean | null
          keywords?: string[] | null
          name: string
          physical_intensity?: string | null
          slug: string
          sort_order?: number
          subcategory_id: string
          updated_at?: string
        }
        Update: {
          age_restriction?: string | null
          can_be_online?: boolean | null
          created_at?: string
          emoji?: string | null
          group_size_max?: number | null
          group_size_min?: number | null
          id?: string
          is_active?: boolean
          is_team_based?: boolean | null
          keywords?: string[] | null
          name?: string
          physical_intensity?: string | null
          slug?: string
          sort_order?: number
          subcategory_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hobby_activities_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "hobby_subcategories"
            referencedColumns: ["id"]
          },
        ]
      }
      hobby_categories: {
        Row: {
          created_at: string
          description: string | null
          emoji: string
          id: string
          is_active: boolean
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          emoji?: string
          id?: string
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          emoji?: string
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      hobby_subcategories: {
        Row: {
          can_be_online: boolean | null
          category_id: string
          created_at: string
          emoji: string | null
          group_size_max: number | null
          group_size_min: number | null
          group_size_typical: number | null
          has_distance: boolean | null
          has_duration: boolean | null
          has_equipment: boolean | null
          has_skill_level: boolean | null
          id: string
          is_active: boolean
          is_competitive: boolean | null
          is_team_based: boolean | null
          location_types: string[] | null
          name: string
          physical_intensity: string | null
          slug: string
          sort_order: number
          suggested_duration_min: number | null
          updated_at: string
        }
        Insert: {
          can_be_online?: boolean | null
          category_id: string
          created_at?: string
          emoji?: string | null
          group_size_max?: number | null
          group_size_min?: number | null
          group_size_typical?: number | null
          has_distance?: boolean | null
          has_duration?: boolean | null
          has_equipment?: boolean | null
          has_skill_level?: boolean | null
          id?: string
          is_active?: boolean
          is_competitive?: boolean | null
          is_team_based?: boolean | null
          location_types?: string[] | null
          name: string
          physical_intensity?: string | null
          slug: string
          sort_order?: number
          suggested_duration_min?: number | null
          updated_at?: string
        }
        Update: {
          can_be_online?: boolean | null
          category_id?: string
          created_at?: string
          emoji?: string | null
          group_size_max?: number | null
          group_size_min?: number | null
          group_size_typical?: number | null
          has_distance?: boolean | null
          has_duration?: boolean | null
          has_equipment?: boolean | null
          has_skill_level?: boolean | null
          id?: string
          is_active?: boolean
          is_competitive?: boolean | null
          is_team_based?: boolean | null
          location_types?: string[] | null
          name?: string
          physical_intensity?: string | null
          slug?: string
          sort_order?: number
          suggested_duration_min?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hobby_subcategories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "hobby_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          created_at: string
          event_invite: boolean
          favorite_category_event: boolean
          friend_request: boolean
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_invite?: boolean
          favorite_category_event?: boolean
          friend_request?: boolean
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_invite?: boolean
          favorite_category_event?: boolean
          friend_request?: boolean
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          data: Json | null
          id: string
          is_read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          is_read?: boolean
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          is_read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      organizer_audit_log: {
        Row: {
          action: string
          actor_user_id: string
          created_at: string
          event_id: string
          id: string
          metadata: Json | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_user_id: string
          created_at?: string
          event_id: string
          id?: string
          metadata?: Json | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string
          created_at?: string
          event_id?: string
          id?: string
          metadata?: Json | null
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organizer_audit_log_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      organizer_messages: {
        Row: {
          audience_filter: string
          body: string
          created_at: string
          delivery_state: string
          event_id: string
          id: string
          message_type: string
          scheduled_for: string | null
          subject: string | null
        }
        Insert: {
          audience_filter?: string
          body: string
          created_at?: string
          delivery_state?: string
          event_id: string
          id?: string
          message_type?: string
          scheduled_for?: string | null
          subject?: string | null
        }
        Update: {
          audience_filter?: string
          body?: string
          created_at?: string
          delivery_state?: string
          event_id?: string
          id?: string
          message_type?: string
          scheduled_for?: string | null
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organizer_messages_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      participation_audits: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          event_id: string
          id: string
          metadata: Json | null
          participation_id: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          event_id: string
          id?: string
          metadata?: Json | null
          participation_id: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          event_id?: string
          id?: string
          metadata?: Json | null
          participation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "participation_audits_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participation_audits_participation_id_fkey"
            columns: ["participation_id"]
            isOneToOne: false
            referencedRelation: "event_participants"
            referencedColumns: ["id"]
          },
        ]
      }
      places_cache: {
        Row: {
          cache_key: string
          created_at: string
          expires_at: string
          id: string
          provider: string
          response_data: Json
        }
        Insert: {
          cache_key: string
          created_at?: string
          expires_at?: string
          id?: string
          provider: string
          response_data: Json
        }
        Update: {
          cache_key?: string
          created_at?: string
          expires_at?: string
          id?: string
          provider?: string
          response_data?: Json
        }
        Relationships: []
      }
      profiles: {
        Row: {
          address: string | null
          address_public: boolean
          age_public: boolean
          avatar_url: string | null
          bio: string | null
          city: string | null
          created_at: string
          date_of_birth: string | null
          display_name: string | null
          district: string | null
          favorite_event_categories: string[] | null
          gender: string | null
          gender_public: boolean
          hobbies: string[] | null
          id: string
          location_lat: number | null
          location_lon: number | null
          preferred_radius_km: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          address_public?: boolean
          age_public?: boolean
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          created_at?: string
          date_of_birth?: string | null
          display_name?: string | null
          district?: string | null
          favorite_event_categories?: string[] | null
          gender?: string | null
          gender_public?: boolean
          hobbies?: string[] | null
          id?: string
          location_lat?: number | null
          location_lon?: number | null
          preferred_radius_km?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          address_public?: boolean
          age_public?: boolean
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          created_at?: string
          date_of_birth?: string | null
          display_name?: string | null
          district?: string | null
          favorite_event_categories?: string[] | null
          gender?: string | null
          gender_public?: boolean
          hobbies?: string[] | null
          id?: string
          location_lat?: number | null
          location_lon?: number | null
          preferred_radius_km?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_reminder_preferences: {
        Row: {
          created_at: string
          id: string
          joined_event_reminders: boolean
          reminder_hours_before: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          joined_event_reminders?: boolean
          reminder_hours_before?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          joined_event_reminders?: boolean
          reminder_hours_before?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      venue_cache: {
        Row: {
          address: string | null
          category: string | null
          city: string | null
          country: string | null
          created_at: string
          details: Json
          external_id: string
          id: string
          image_url: string | null
          lat: number
          lon: number
          name: string
          opening_hours_text: string[] | null
          phone: string | null
          postal_code: string | null
          provider: string
          rating: number | null
          tags: string[]
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          category?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          details?: Json
          external_id: string
          id?: string
          image_url?: string | null
          lat: number
          lon: number
          name: string
          opening_hours_text?: string[] | null
          phone?: string | null
          postal_code?: string | null
          provider: string
          rating?: number | null
          tags?: string[]
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          category?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          details?: Json
          external_id?: string
          id?: string
          image_url?: string | null
          lat?: number
          lon?: number
          name?: string
          opening_hours_text?: string[] | null
          phone?: string | null
          postal_code?: string | null
          provider?: string
          rating?: number | null
          tags?: string[]
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      venue_sync_runs: {
        Row: {
          cities_covered: string[]
          created_at: string
          duration_ms: number | null
          errors: string[] | null
          id: string
          scope: string
          total_upserted: number
        }
        Insert: {
          cities_covered?: string[]
          created_at?: string
          duration_ms?: number | null
          errors?: string[] | null
          id?: string
          scope?: string
          total_upserted?: number
        }
        Update: {
          cities_covered?: string[]
          created_at?: string
          duration_ms?: number | null
          errors?: string[] | null
          id?: string
          scope?: string
          total_upserted?: number
        }
        Relationships: []
      }
      virtual_hub_members: {
        Row: {
          hub_id: string
          id: string
          joined_at: string
          user_id: string
        }
        Insert: {
          hub_id: string
          id?: string
          joined_at?: string
          user_id: string
        }
        Update: {
          hub_id?: string
          id?: string
          joined_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "virtual_hub_members_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "virtual_hubs"
            referencedColumns: ["id"]
          },
        ]
      }
      virtual_hubs: {
        Row: {
          city: string | null
          created_at: string
          hobby_activity: string | null
          hobby_category: string
          hobby_subcategory: string | null
          id: string
          member_count: number
          updated_at: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          hobby_activity?: string | null
          hobby_category: string
          hobby_subcategory?: string | null
          id?: string
          member_count?: number
          updated_at?: string
        }
        Update: {
          city?: string | null
          created_at?: string
          hobby_activity?: string | null
          hobby_category?: string
          hobby_subcategory?: string | null
          id?: string
          member_count?: number
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      refresh_virtual_hubs: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
