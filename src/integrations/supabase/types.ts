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
      event_participants: {
        Row: {
          event_id: string
          id: string
          joined_at: string
          user_id: string
        }
        Insert: {
          event_id: string
          id?: string
          joined_at?: string
          user_id: string
        }
        Update: {
          event_id?: string
          id?: string
          joined_at?: string
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
          location_type: string | null
          max_attendees: number | null
          tags: string[] | null
          title: string
          updated_at: string
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
          location_type?: string | null
          max_attendees?: number | null
          tags?: string[] | null
          title: string
          updated_at?: string
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
          location_type?: string | null
          max_attendees?: number | null
          tags?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: []
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
          gender: string | null
          gender_public: boolean
          hobbies: string[] | null
          id: string
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
          gender?: string | null
          gender_public?: boolean
          hobbies?: string[] | null
          id?: string
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
          gender?: string | null
          gender_public?: boolean
          hobbies?: string[] | null
          id?: string
          preferred_radius_km?: number | null
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
