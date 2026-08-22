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
      account_activity_events: {
        Row: {
          created_at: string
          device_label: string | null
          event_type: string
          id: string
          metadata: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          device_label?: string | null
          event_type: string
          id?: string
          metadata?: Json
          user_id: string
        }
        Update: {
          created_at?: string
          device_label?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          user_id?: string
        }
        Relationships: []
      }
      admin_approval_requests: {
        Row: {
          action: string
          capability_key: string
          correlation_id: string
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          executed_at: string | null
          expires_at: string
          id: string
          idempotency_key: string
          reason: string
          requested_at: string
          requested_by: string
          safe_action_payload: Json
          state: string
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          capability_key: string
          correlation_id?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          executed_at?: string | null
          expires_at?: string
          id?: string
          idempotency_key: string
          reason: string
          requested_at?: string
          requested_by: string
          safe_action_payload?: Json
          state?: string
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          capability_key?: string
          correlation_id?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          executed_at?: string | null
          expires_at?: string
          id?: string
          idempotency_key?: string
          reason?: string
          requested_at?: string
          requested_by?: string
          safe_action_payload?: Json
          state?: string
          target_id?: string | null
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_approval_requests_capability_key_fkey"
            columns: ["capability_key"]
            isOneToOne: false
            referencedRelation: "admin_capabilities"
            referencedColumns: ["capability_key"]
          },
        ]
      }
      admin_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          after_redacted: Json | null
          approval_request_id: string | null
          before_redacted: Json | null
          capability_key: string | null
          correlation_id: string
          created_at: string
          error_code: string | null
          id: string
          idempotency_key: string
          outcome: string
          reason: string
          request_id: string
          retention_until: string
          role_snapshot: string[]
          safe_metadata: Json
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          after_redacted?: Json | null
          approval_request_id?: string | null
          before_redacted?: Json | null
          capability_key?: string | null
          correlation_id?: string
          created_at?: string
          error_code?: string | null
          id?: string
          idempotency_key: string
          outcome: string
          reason: string
          request_id: string
          retention_until?: string
          role_snapshot?: string[]
          safe_metadata?: Json
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          after_redacted?: Json | null
          approval_request_id?: string | null
          before_redacted?: Json | null
          capability_key?: string | null
          correlation_id?: string
          created_at?: string
          error_code?: string | null
          id?: string
          idempotency_key?: string
          outcome?: string
          reason?: string
          request_id?: string
          retention_until?: string
          role_snapshot?: string[]
          safe_metadata?: Json
          target_id?: string | null
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_log_approval_request_id_fkey"
            columns: ["approval_request_id"]
            isOneToOne: false
            referencedRelation: "admin_approval_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_audit_log_capability_key_fkey"
            columns: ["capability_key"]
            isOneToOne: false
            referencedRelation: "admin_capabilities"
            referencedColumns: ["capability_key"]
          },
        ]
      }
      admin_bulk_user_job_items: {
        Row: {
          after_redacted: Json
          attempts: number
          before_redacted: Json
          completed_at: string | null
          error_code: string | null
          job_id: string
          started_at: string | null
          status: string
          target_origin: string
          target_profile_id: string | null
          target_user_id: string
          updated_at: string
        }
        Insert: {
          after_redacted?: Json
          attempts?: number
          before_redacted?: Json
          completed_at?: string | null
          error_code?: string | null
          job_id: string
          started_at?: string | null
          status?: string
          target_origin: string
          target_profile_id?: string | null
          target_user_id: string
          updated_at?: string
        }
        Update: {
          after_redacted?: Json
          attempts?: number
          before_redacted?: Json
          completed_at?: string | null
          error_code?: string | null
          job_id?: string
          started_at?: string | null
          status?: string
          target_origin?: string
          target_profile_id?: string | null
          target_user_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_bulk_user_job_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "admin_bulk_user_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_bulk_user_jobs: {
        Row: {
          action: string
          actor_id: string
          affected_count: number
          approval_request_id: string | null
          completed_at: string | null
          correlation_id: string
          created_at: string
          failure_count: number
          id: string
          idempotency_key: string
          reason: string
          request_id: string
          rollback_supported: boolean
          started_at: string | null
          status: string
          target_count: number
          target_digest: string
          target_filter_snapshot: Json
          updated_at: string
        }
        Insert: {
          action: string
          actor_id: string
          affected_count?: number
          approval_request_id?: string | null
          completed_at?: string | null
          correlation_id?: string
          created_at?: string
          failure_count?: number
          id?: string
          idempotency_key: string
          reason: string
          request_id: string
          rollback_supported: boolean
          started_at?: string | null
          status?: string
          target_count: number
          target_digest: string
          target_filter_snapshot?: Json
          updated_at?: string
        }
        Update: {
          action?: string
          actor_id?: string
          affected_count?: number
          approval_request_id?: string | null
          completed_at?: string | null
          correlation_id?: string
          created_at?: string
          failure_count?: number
          id?: string
          idempotency_key?: string
          reason?: string
          request_id?: string
          rollback_supported?: boolean
          started_at?: string | null
          status?: string
          target_count?: number
          target_digest?: string
          target_filter_snapshot?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_bulk_user_jobs_approval_request_id_fkey"
            columns: ["approval_request_id"]
            isOneToOne: false
            referencedRelation: "admin_approval_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_capabilities: {
        Row: {
          capability_key: string
          created_at: string
          description: string
          requires_reason: boolean
          risk_level: string
          supports_four_eyes: boolean
        }
        Insert: {
          capability_key: string
          created_at?: string
          description: string
          requires_reason?: boolean
          risk_level?: string
          supports_four_eyes?: boolean
        }
        Update: {
          capability_key?: string
          created_at?: string
          description?: string
          requires_reason?: boolean
          risk_level?: string
          supports_four_eyes?: boolean
        }
        Relationships: []
      }
      admin_operator_roles: {
        Row: {
          created_at: string
          expires_at: string | null
          grant_reason: string
          granted_by: string | null
          revoked_at: string | null
          revoked_by: string | null
          role_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          grant_reason: string
          granted_by?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          role_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          grant_reason?: string
          granted_by?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          role_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      admin_role_capabilities: {
        Row: {
          capability_key: string
          created_at: string
          role_key: string
        }
        Insert: {
          capability_key: string
          created_at?: string
          role_key: string
        }
        Update: {
          capability_key?: string
          created_at?: string
          role_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_role_capabilities_capability_key_fkey"
            columns: ["capability_key"]
            isOneToOne: false
            referencedRelation: "admin_capabilities"
            referencedColumns: ["capability_key"]
          },
        ]
      }
      ai_event_candidate_cache: {
        Row: {
          cache_key: string
          candidate: Json
          created_at: string
          expires_at: string
          hub_id: string
          model: string
          prompt_template_version: number
          updated_at: string
        }
        Insert: {
          cache_key: string
          candidate: Json
          created_at?: string
          expires_at: string
          hub_id: string
          model: string
          prompt_template_version: number
          updated_at?: string
        }
        Update: {
          cache_key?: string
          candidate?: Json
          created_at?: string
          expires_at?: string
          hub_id?: string
          model?: string
          prompt_template_version?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_event_candidate_cache_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "virtual_hub_discovery_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_event_candidate_cache_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "virtual_hubs"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_event_generation_jobs: {
        Row: {
          attempt_count: number
          completed_at: string | null
          created_at: string
          generation_run_id: string | null
          id: string
          idempotency_key: string
          last_error_code: string | null
          lease_expires_at: string | null
          lease_token: string | null
          max_attempts: number
          next_attempt_at: string
          request_metadata: Json
          requested_by: string
          status: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          generation_run_id?: string | null
          id?: string
          idempotency_key: string
          last_error_code?: string | null
          lease_expires_at?: string | null
          lease_token?: string | null
          max_attempts?: number
          next_attempt_at?: string
          request_metadata?: Json
          requested_by: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          generation_run_id?: string | null
          id?: string
          idempotency_key?: string
          last_error_code?: string | null
          lease_expires_at?: string | null
          lease_token?: string | null
          max_attempts?: number
          next_attempt_at?: string
          request_metadata?: Json
          requested_by?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_event_generation_jobs_generation_run_id_fkey"
            columns: ["generation_run_id"]
            isOneToOne: false
            referencedRelation: "ai_event_generation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_event_generation_runs: {
        Row: {
          completed_at: string | null
          error_code: string | null
          error_message: string | null
          estimated_cost_microunits: number
          fallback_count: number
          id: string
          idempotency_key: string
          input_tokens: number
          model: string | null
          output_tokens: number
          prompt_template_version: number
          proposal_count: number
          provider: string | null
          qualified_hub_count: number
          request_metadata: Json
          requested_by: string | null
          started_at: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          error_code?: string | null
          error_message?: string | null
          estimated_cost_microunits?: number
          fallback_count?: number
          id?: string
          idempotency_key: string
          input_tokens?: number
          model?: string | null
          output_tokens?: number
          prompt_template_version?: number
          proposal_count?: number
          provider?: string | null
          qualified_hub_count?: number
          request_metadata?: Json
          requested_by?: string | null
          started_at?: string
          status?: string
        }
        Update: {
          completed_at?: string | null
          error_code?: string | null
          error_message?: string | null
          estimated_cost_microunits?: number
          fallback_count?: number
          id?: string
          idempotency_key?: string
          input_tokens?: number
          model?: string | null
          output_tokens?: number
          prompt_template_version?: number
          proposal_count?: number
          provider?: string | null
          qualified_hub_count?: number
          request_metadata?: Json
          requested_by?: string | null
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      ai_event_proposal_audit_events: {
        Row: {
          action: string
          actor_id: string | null
          after_state: Json | null
          before_state: Json | null
          correlation_id: string
          created_at: string
          from_status: string | null
          id: string
          proposal_id: string
          reason: string | null
          to_status: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          correlation_id?: string
          created_at?: string
          from_status?: string | null
          id?: string
          proposal_id: string
          reason?: string | null
          to_status?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          correlation_id?: string
          created_at?: string
          from_status?: string | null
          id?: string
          proposal_id?: string
          reason?: string | null
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_event_proposal_audit_events_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "ai_event_proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_event_proposals: {
        Row: {
          activity: string | null
          approved_at: string | null
          approved_by: string | null
          area_hint: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          category: string
          city: string
          confidence: number
          correlation_id: string
          created_at: string
          demand_reason: string
          demand_snapshot: Json
          description: string
          generation_mode: string
          generation_run_id: string | null
          host_responsibility_accepted_at: string | null
          hub_id: string
          human_edits: Json
          id: string
          idempotency_key: string
          model: string | null
          moderation_result: Json
          moderation_reviewed_at: string | null
          moderation_reviewed_by: string | null
          moderation_status: string
          organizer_id: string | null
          prompt_template_version: number
          provenance: Json
          provider: string | null
          published_at: string | null
          published_by: string | null
          published_event_id: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          schema_version: number
          status: string
          subcategory: string | null
          suggested_end: string
          suggested_start: string
          target_capacity: number
          timezone: string
          title: string
          updated_at: string
          venue_address: string | null
          venue_category: string
          venue_lat: number | null
          venue_lon: number | null
          venue_name: string | null
          venue_validation_status: string
          venue_verified_at: string | null
          venue_verified_by: string | null
        }
        Insert: {
          activity?: string | null
          approved_at?: string | null
          approved_by?: string | null
          area_hint?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          category: string
          city: string
          confidence: number
          correlation_id?: string
          created_at?: string
          demand_reason: string
          demand_snapshot?: Json
          description: string
          generation_mode?: string
          generation_run_id?: string | null
          host_responsibility_accepted_at?: string | null
          hub_id: string
          human_edits?: Json
          id?: string
          idempotency_key: string
          model?: string | null
          moderation_result?: Json
          moderation_reviewed_at?: string | null
          moderation_reviewed_by?: string | null
          moderation_status?: string
          organizer_id?: string | null
          prompt_template_version?: number
          provenance?: Json
          provider?: string | null
          published_at?: string | null
          published_by?: string | null
          published_event_id?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          schema_version?: number
          status?: string
          subcategory?: string | null
          suggested_end: string
          suggested_start: string
          target_capacity: number
          timezone?: string
          title: string
          updated_at?: string
          venue_address?: string | null
          venue_category: string
          venue_lat?: number | null
          venue_lon?: number | null
          venue_name?: string | null
          venue_validation_status?: string
          venue_verified_at?: string | null
          venue_verified_by?: string | null
        }
        Update: {
          activity?: string | null
          approved_at?: string | null
          approved_by?: string | null
          area_hint?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          category?: string
          city?: string
          confidence?: number
          correlation_id?: string
          created_at?: string
          demand_reason?: string
          demand_snapshot?: Json
          description?: string
          generation_mode?: string
          generation_run_id?: string | null
          host_responsibility_accepted_at?: string | null
          hub_id?: string
          human_edits?: Json
          id?: string
          idempotency_key?: string
          model?: string | null
          moderation_result?: Json
          moderation_reviewed_at?: string | null
          moderation_reviewed_by?: string | null
          moderation_status?: string
          organizer_id?: string | null
          prompt_template_version?: number
          provenance?: Json
          provider?: string | null
          published_at?: string | null
          published_by?: string | null
          published_event_id?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          schema_version?: number
          status?: string
          subcategory?: string | null
          suggested_end?: string
          suggested_start?: string
          target_capacity?: number
          timezone?: string
          title?: string
          updated_at?: string
          venue_address?: string | null
          venue_category?: string
          venue_lat?: number | null
          venue_lon?: number | null
          venue_name?: string | null
          venue_validation_status?: string
          venue_verified_at?: string | null
          venue_verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_event_proposals_generation_run_id_fkey"
            columns: ["generation_run_id"]
            isOneToOne: false
            referencedRelation: "ai_event_generation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_event_proposals_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "virtual_hub_discovery_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_event_proposals_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "virtual_hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_event_proposals_published_event_id_fkey"
            columns: ["published_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      auto_event_config: {
        Row: {
          auto_publish_enabled: boolean
          categories_filter: string[] | null
          created_at: string
          daily_proposal_limit: number
          daily_token_budget: number
          enabled: boolean
          frequency_days: number
          generation_timeout_ms: number
          id: string
          k_anonymity_threshold: number
          kill_switch: boolean
          last_run_at: string | null
          last_run_result: Json | null
          max_distance_km: number
          max_events_per_run: number
          max_upcoming_overlapping_events: number
          min_explicit_interest_members: number
          min_members: number
          min_recent_active_members: number
          model_name: string
          prompt_template_version: number
          proposal_cooldown_days: number
          proposal_generation_enabled: boolean
          updated_at: string
        }
        Insert: {
          auto_publish_enabled?: boolean
          categories_filter?: string[] | null
          created_at?: string
          daily_proposal_limit?: number
          daily_token_budget?: number
          enabled?: boolean
          frequency_days?: number
          generation_timeout_ms?: number
          id?: string
          k_anonymity_threshold?: number
          kill_switch?: boolean
          last_run_at?: string | null
          last_run_result?: Json | null
          max_distance_km?: number
          max_events_per_run?: number
          max_upcoming_overlapping_events?: number
          min_explicit_interest_members?: number
          min_members?: number
          min_recent_active_members?: number
          model_name?: string
          prompt_template_version?: number
          proposal_cooldown_days?: number
          proposal_generation_enabled?: boolean
          updated_at?: string
        }
        Update: {
          auto_publish_enabled?: boolean
          categories_filter?: string[] | null
          created_at?: string
          daily_proposal_limit?: number
          daily_token_budget?: number
          enabled?: boolean
          frequency_days?: number
          generation_timeout_ms?: number
          id?: string
          k_anonymity_threshold?: number
          kill_switch?: boolean
          last_run_at?: string | null
          last_run_result?: Json | null
          max_distance_km?: number
          max_events_per_run?: number
          max_upcoming_overlapping_events?: number
          min_explicit_interest_members?: number
          min_members?: number
          min_recent_active_members?: number
          model_name?: string
          prompt_template_version?: number
          proposal_cooldown_days?: number
          proposal_generation_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      billing_provider_events: {
        Row: {
          error_code: string | null
          event_type: string
          id: string
          processed_at: string | null
          processing_status: string
          provider_event_ref: string
          provider_key: string
          received_at: string
          reconciliation_status: string
          redacted_payload: Json
          signature_verified: boolean
        }
        Insert: {
          error_code?: string | null
          event_type: string
          id?: string
          processed_at?: string | null
          processing_status?: string
          provider_event_ref: string
          provider_key: string
          received_at?: string
          reconciliation_status?: string
          redacted_payload?: Json
          signature_verified?: boolean
        }
        Update: {
          error_code?: string | null
          event_type?: string
          id?: string
          processed_at?: string | null
          processing_status?: string
          provider_event_ref?: string
          provider_key?: string
          received_at?: string
          reconciliation_status?: string
          redacted_payload?: Json
          signature_verified?: boolean
        }
        Relationships: []
      }
      circle_suggestions: {
        Row: {
          activity_label: string
          city: string | null
          created_at: string
          evidence_connection_ids: string[]
          expires_at: string
          generation_key: string | null
          id: string
          last_evaluated_at: string
          status: string
          suggested_by: string
          suggested_member_ids: string[]
          updated_at: string
        }
        Insert: {
          activity_label: string
          city?: string | null
          created_at?: string
          evidence_connection_ids?: string[]
          expires_at?: string
          generation_key?: string | null
          id?: string
          last_evaluated_at?: string
          status?: string
          suggested_by: string
          suggested_member_ids?: string[]
          updated_at?: string
        }
        Update: {
          activity_label?: string
          city?: string | null
          created_at?: string
          evidence_connection_ids?: string[]
          expires_at?: string
          generation_key?: string | null
          id?: string
          last_evaluated_at?: string
          status?: string
          suggested_by?: string
          suggested_member_ids?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      connections: {
        Row: {
          connected_at: string
          ended_at: string | null
          id: string
          source_encounter_id: string | null
          status: string
          updated_at: string
          user_high_id: string
          user_low_id: string
        }
        Insert: {
          connected_at?: string
          ended_at?: string | null
          id?: string
          source_encounter_id?: string | null
          status?: string
          updated_at?: string
          user_high_id: string
          user_low_id: string
        }
        Update: {
          connected_at?: string
          ended_at?: string | null
          id?: string
          source_encounter_id?: string | null
          status?: string
          updated_at?: string
          user_high_id?: string
          user_low_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "connections_source_encounter_id_fkey"
            columns: ["source_encounter_id"]
            isOneToOne: false
            referencedRelation: "event_encounters"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_records: {
        Row: {
          decided_at: string
          decision: string
          id: string
          idempotency_key: string
          policy_version: string
          purpose: string
          source_surface: string
          user_id: string
          withdrawn_at: string | null
        }
        Insert: {
          decided_at?: string
          decision: string
          id?: string
          idempotency_key: string
          policy_version: string
          purpose: string
          source_surface: string
          user_id: string
          withdrawn_at?: string | null
        }
        Update: {
          decided_at?: string
          decision?: string
          id?: string
          idempotency_key?: string
          policy_version?: string
          purpose?: string
          source_surface?: string
          user_id?: string
          withdrawn_at?: string | null
        }
        Relationships: []
      }
      data_deletion_receipts: {
        Row: {
          completed_at: string
          correlation_id: string
          deletion_mode: string
          domain: string
          id: string
          rows_affected: number
          subject_pseudonym: string
        }
        Insert: {
          completed_at?: string
          correlation_id: string
          deletion_mode: string
          domain: string
          id?: string
          rows_affected?: number
          subject_pseudonym: string
        }
        Update: {
          completed_at?: string
          correlation_id?: string
          deletion_mode?: string
          domain?: string
          id?: string
          rows_affected?: number
          subject_pseudonym?: string
        }
        Relationships: []
      }
      data_subject_requests: {
        Row: {
          cancelled_at: string | null
          completed_at: string | null
          export_expires_at: string | null
          export_scope: string[]
          grace_period_ends_at: string | null
          id: string
          policy_snapshot: Json
          prepared_at: string | null
          request_key: string | null
          request_type: string
          requested_at: string
          retention_exception_code: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cancelled_at?: string | null
          completed_at?: string | null
          export_expires_at?: string | null
          export_scope?: string[]
          grace_period_ends_at?: string | null
          id?: string
          policy_snapshot?: Json
          prepared_at?: string | null
          request_key?: string | null
          request_type: string
          requested_at?: string
          retention_exception_code?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cancelled_at?: string | null
          completed_at?: string | null
          export_expires_at?: string | null
          export_scope?: string[]
          grace_period_ends_at?: string | null
          id?: string
          policy_snapshot?: Json
          prepared_at?: string | null
          request_key?: string | null
          request_type?: string
          requested_at?: string
          retention_exception_code?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      discovery_preference_history: {
        Row: {
          candidate_source: string
          canonical_identity: string
          created_at: string
          id: string
          idempotency_key: string
          preference: string
          user_id: string
        }
        Insert: {
          candidate_source: string
          canonical_identity: string
          created_at?: string
          id?: string
          idempotency_key: string
          preference: string
          user_id: string
        }
        Update: {
          candidate_source?: string
          canonical_identity?: string
          created_at?: string
          id?: string
          idempotency_key?: string
          preference?: string
          user_id?: string
        }
        Relationships: []
      }
      discovery_preferences: {
        Row: {
          active: boolean
          candidate_source: string
          canonical_identity: string
          created_at: string
          id: string
          last_idempotency_key: string
          preference: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          candidate_source: string
          canonical_identity: string
          created_at?: string
          id?: string
          last_idempotency_key: string
          preference: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          candidate_source?: string
          canonical_identity?: string
          created_at?: string
          id?: string
          last_idempotency_key?: string
          preference?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      edge_rate_limit_buckets: {
        Row: {
          endpoint: string
          request_count: number
          subject_hash: string
          updated_at: string
          window_started_at: string
        }
        Insert: {
          endpoint: string
          request_count?: number
          subject_hash: string
          updated_at?: string
          window_started_at: string
        }
        Update: {
          endpoint?: string
          request_count?: number
          subject_hash?: string
          updated_at?: string
          window_started_at?: string
        }
        Relationships: []
      }
      entitlement_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          correlation_id: string
          created_at: string
          grant_id: string | null
          id: string
          idempotency_key: string
          reason: string
          reconciliation_after: string | null
          reconciliation_before: string | null
          status_after: string | null
          status_before: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          correlation_id: string
          created_at?: string
          grant_id?: string | null
          id?: string
          idempotency_key: string
          reason: string
          reconciliation_after?: string | null
          reconciliation_before?: string | null
          status_after?: string | null
          status_before?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          correlation_id?: string
          created_at?: string
          grant_id?: string | null
          id?: string
          idempotency_key?: string
          reason?: string
          reconciliation_after?: string | null
          reconciliation_before?: string | null
          status_after?: string | null
          status_before?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entitlement_audit_log_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "entitlement_grants"
            referencedColumns: ["id"]
          },
        ]
      }
      entitlement_grants: {
        Row: {
          cancellation_state: string | null
          created_at: string
          ends_at: string | null
          feature_key: string
          grace_ends_at: string | null
          id: string
          invoice_state: string | null
          limit_value: number | null
          plan_key: string | null
          provider_event_ref: string | null
          reconciliation_status: string
          refund_state: string | null
          starts_at: string
          status: string
          tax_state: string | null
          trial_ends_at: string | null
          updated_at: string
          used_value: number
          user_id: string
        }
        Insert: {
          cancellation_state?: string | null
          created_at?: string
          ends_at?: string | null
          feature_key: string
          grace_ends_at?: string | null
          id?: string
          invoice_state?: string | null
          limit_value?: number | null
          plan_key?: string | null
          provider_event_ref?: string | null
          reconciliation_status?: string
          refund_state?: string | null
          starts_at: string
          status: string
          tax_state?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          used_value?: number
          user_id: string
        }
        Update: {
          cancellation_state?: string | null
          created_at?: string
          ends_at?: string | null
          feature_key?: string
          grace_ends_at?: string | null
          id?: string
          invoice_state?: string | null
          limit_value?: number | null
          plan_key?: string | null
          provider_event_ref?: string | null
          reconciliation_status?: string
          refund_state?: string | null
          starts_at?: string
          status?: string
          tax_state?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          used_value?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entitlement_grants_plan_key_fkey"
            columns: ["plan_key"]
            isOneToOne: false
            referencedRelation: "product_plans"
            referencedColumns: ["key"]
          },
        ]
      }
      event_crew_roles: {
        Row: {
          can_check_in: boolean
          can_edit_event: boolean
          can_message_attendees: boolean
          can_moderate: boolean
          can_view_finance: boolean
          created_at: string
          event_id: string
          granted_by: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          can_check_in?: boolean
          can_edit_event?: boolean
          can_message_attendees?: boolean
          can_moderate?: boolean
          can_view_finance?: boolean
          created_at?: string
          event_id: string
          granted_by: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          can_check_in?: boolean
          can_edit_event?: boolean
          can_message_attendees?: boolean
          can_moderate?: boolean
          can_view_finance?: boolean
          created_at?: string
          event_id?: string
          granted_by?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_crew_roles_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_encounters: {
        Row: {
          attendance_verified: boolean
          confidence_status: string
          created_at: string
          eligible_at: string
          event_id: string
          expires_at: string
          id: string
          suggested_at: string | null
          updated_at: string
          user_high_id: string
          user_low_id: string
        }
        Insert: {
          attendance_verified?: boolean
          confidence_status?: string
          created_at?: string
          eligible_at?: string
          event_id: string
          expires_at?: string
          id?: string
          suggested_at?: string | null
          updated_at?: string
          user_high_id: string
          user_low_id: string
        }
        Update: {
          attendance_verified?: boolean
          confidence_status?: string
          created_at?: string
          eligible_at?: string
          event_id?: string
          expires_at?: string
          id?: string
          suggested_at?: string | null
          updated_at?: string
          user_high_id?: string
          user_low_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_encounters_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_message_recipients: {
        Row: {
          created_at: string
          message_id: string
          participation_id: string
          recipient_user_id: string
          selection_source: string
        }
        Insert: {
          created_at?: string
          message_id: string
          participation_id: string
          recipient_user_id: string
          selection_source: string
        }
        Update: {
          created_at?: string
          message_id?: string
          participation_id?: string
          recipient_user_id?: string
          selection_source?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_message_recipients_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "event_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_message_recipients_participation_id_fkey"
            columns: ["participation_id"]
            isOneToOne: false
            referencedRelation: "event_participants"
            referencedColumns: ["id"]
          },
        ]
      }
      event_messages: {
        Row: {
          actor_user_id: string
          audience_count: number
          audience_filter: string
          body: string
          created_at: string
          delivered_count: number
          delivery_state: string
          event_id: string
          failed_count: number
          id: string
          idempotency_key: string | null
          last_error_code: string | null
          message_type: string
          request_id: string | null
          scheduled_for: string | null
          subject: string | null
        }
        Insert: {
          actor_user_id: string
          audience_count?: number
          audience_filter: string
          body: string
          created_at?: string
          delivered_count?: number
          delivery_state?: string
          event_id: string
          failed_count?: number
          id?: string
          idempotency_key?: string | null
          last_error_code?: string | null
          message_type: string
          request_id?: string | null
          scheduled_for?: string | null
          subject?: string | null
        }
        Update: {
          actor_user_id?: string
          audience_count?: number
          audience_filter?: string
          body?: string
          created_at?: string
          delivered_count?: number
          delivery_state?: string
          event_id?: string
          failed_count?: number
          id?: string
          idempotency_key?: string | null
          last_error_code?: string | null
          message_type?: string
          request_id?: string | null
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
      event_operation_audits: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          event_id: string
          id: string
          idempotency_key: string
          metadata: Json
          next_state: string | null
          participation_id: string | null
          previous_state: string | null
          reason: string | null
          request_id: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          event_id: string
          id?: string
          idempotency_key: string
          metadata?: Json
          next_state?: string | null
          participation_id?: string | null
          previous_state?: string | null
          reason?: string | null
          request_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          event_id?: string
          id?: string
          idempotency_key?: string
          metadata?: Json
          next_state?: string | null
          participation_id?: string | null
          previous_state?: string | null
          reason?: string | null
          request_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_operation_audits_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_operation_audits_participation_id_fkey"
            columns: ["participation_id"]
            isOneToOne: false
            referencedRelation: "event_participants"
            referencedColumns: ["id"]
          },
        ]
      }
      event_participants: {
        Row: {
          arrival_visibility: string
          arriving_alone: boolean | null
          checked_in_at: string | null
          completed_at: string | null
          event_id: string
          first_hobbeast_event: boolean | null
          id: string
          invite_code: string | null
          joined_at: string
          last_mutation_key: string | null
          no_show_marked_at: string | null
          organizer_note: string | null
          participation_type: string | null
          status: string
          status_updated_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          arrival_visibility?: string
          arriving_alone?: boolean | null
          checked_in_at?: string | null
          completed_at?: string | null
          event_id: string
          first_hobbeast_event?: boolean | null
          id?: string
          invite_code?: string | null
          joined_at?: string
          last_mutation_key?: string | null
          no_show_marked_at?: string | null
          organizer_note?: string | null
          participation_type?: string | null
          status?: string
          status_updated_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          arrival_visibility?: string
          arriving_alone?: boolean | null
          checked_in_at?: string | null
          completed_at?: string | null
          event_id?: string
          first_hobbeast_event?: boolean | null
          id?: string
          invite_code?: string | null
          joined_at?: string
          last_mutation_key?: string | null
          no_show_marked_at?: string | null
          organizer_note?: string | null
          participation_type?: string | null
          status?: string
          status_updated_at?: string | null
          updated_at?: string
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
      event_safety_profiles: {
        Row: {
          capacity_ack: boolean
          event_id: string
          host_accountability_ack: boolean
          participant_rules: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          risk_flags: string[]
          updated_at: string
          venue_suitability_note: string | null
          venue_visibility: string
        }
        Insert: {
          capacity_ack?: boolean
          event_id: string
          host_accountability_ack?: boolean
          participant_rules?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk_flags?: string[]
          updated_at?: string
          venue_suitability_note?: string | null
          venue_visibility?: string
        }
        Update: {
          capacity_ack?: boolean
          event_id?: string
          host_accountability_ack?: boolean
          participant_rules?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk_flags?: string[]
          updated_at?: string
          venue_suitability_note?: string | null
          venue_visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_safety_profiles_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_series: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          owner_user_id: string
          recurrence_rule: string
          timezone: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          owner_user_id: string
          recurrence_rule: string
          timezone?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          owner_user_id?: string
          recurrence_rule?: string
          timezone?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      event_series_audit_events: {
        Row: {
          action: string
          actor_user_id: string | null
          after_state: Json | null
          before_state: Json | null
          created_at: string
          id: string
          idempotency_key: string
          occurrence_id: string | null
          reason: string | null
          series_id: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          id?: string
          idempotency_key: string
          occurrence_id?: string | null
          reason?: string | null
          series_id: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          id?: string
          idempotency_key?: string
          occurrence_id?: string | null
          reason?: string | null
          series_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_series_audit_events_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "event_series_occurrences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_series_audit_events_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "event_series"
            referencedColumns: ["id"]
          },
        ]
      }
      event_series_occurrences: {
        Row: {
          created_at: string
          event_id: string | null
          exception_reason: string | null
          id: string
          occurrence_start: string
          occurrence_state: string
          original_start: string
          series_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id?: string | null
          exception_reason?: string | null
          id?: string
          occurrence_start: string
          occurrence_state?: string
          original_start: string
          series_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string | null
          exception_reason?: string | null
          id?: string
          occurrence_start?: string
          occurrence_state?: string
          original_start?: string
          series_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_series_occurrences_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_series_occurrences_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "event_series"
            referencedColumns: ["id"]
          },
        ]
      }
      event_trip_plans: {
        Row: {
          created_at: string
          end_point: Json
          event_id: string
          id: string
          provider: string
          route_type: string
          start_point: Json
          waypoints: Json
        }
        Insert: {
          created_at?: string
          end_point: Json
          event_id: string
          id?: string
          provider: string
          route_type: string
          start_point: Json
          waypoints?: Json
        }
        Update: {
          created_at?: string
          end_point?: Json
          event_id?: string
          id?: string
          provider?: string
          route_type?: string
          start_point?: Json
          waypoints?: Json
        }
        Relationships: [
          {
            foreignKeyName: "event_trip_plans_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          accessibility_info: string | null
          activity_intensity: string | null
          ai_proposal_id: string | null
          archived_at: string | null
          attended_count: number
          average_rating: number | null
          beginner_friendly: boolean | null
          cancellation_policy: string | null
          cancellation_reason: string | null
          cancellations_count: number
          cancelled_at: string | null
          category: string
          completed_at: string | null
          cost_details: string | null
          created_at: string
          created_by: string
          description: string | null
          end_time: string | null
          equipment_required: string | null
          event_date: string | null
          event_time: string | null
          expected_end_at: string | null
          host_responsibility_accepted_at: string | null
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
          meeting_instructions: string | null
          organizer_id: string | null
          organizer_readiness_required: boolean
          outcome_status: string
          participation_type: string | null
          place_address: string | null
          place_categories: string[] | null
          place_category_confidence: number | null
          place_city: string | null
          place_country: string | null
          place_distance_m: number | null
          place_lat: number | null
          place_lon: number | null
          place_name: string | null
          place_source: string | null
          private_location_reveal_hours: number
          rating_count: number
          readiness_enforcement_version: string | null
          registrations_count: number
          reschedule_version: number
          source_origin: string
          start_time: string | null
          started_at: string | null
          tags: string[] | null
          title: string
          updated_at: string
          venue_validation_status: string
          visibility_type: string | null
          waitlist_enabled: boolean | null
        }
        Insert: {
          accessibility_info?: string | null
          activity_intensity?: string | null
          ai_proposal_id?: string | null
          archived_at?: string | null
          attended_count?: number
          average_rating?: number | null
          beginner_friendly?: boolean | null
          cancellation_policy?: string | null
          cancellation_reason?: string | null
          cancellations_count?: number
          cancelled_at?: string | null
          category?: string
          completed_at?: string | null
          cost_details?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          end_time?: string | null
          equipment_required?: string | null
          event_date?: string | null
          event_time?: string | null
          expected_end_at?: string | null
          host_responsibility_accepted_at?: string | null
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
          meeting_instructions?: string | null
          organizer_id?: string | null
          organizer_readiness_required?: boolean
          outcome_status?: string
          participation_type?: string | null
          place_address?: string | null
          place_categories?: string[] | null
          place_category_confidence?: number | null
          place_city?: string | null
          place_country?: string | null
          place_distance_m?: number | null
          place_lat?: number | null
          place_lon?: number | null
          place_name?: string | null
          place_source?: string | null
          private_location_reveal_hours?: number
          rating_count?: number
          readiness_enforcement_version?: string | null
          registrations_count?: number
          reschedule_version?: number
          source_origin?: string
          start_time?: string | null
          started_at?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string
          venue_validation_status?: string
          visibility_type?: string | null
          waitlist_enabled?: boolean | null
        }
        Update: {
          accessibility_info?: string | null
          activity_intensity?: string | null
          ai_proposal_id?: string | null
          archived_at?: string | null
          attended_count?: number
          average_rating?: number | null
          beginner_friendly?: boolean | null
          cancellation_policy?: string | null
          cancellation_reason?: string | null
          cancellations_count?: number
          cancelled_at?: string | null
          category?: string
          completed_at?: string | null
          cost_details?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          end_time?: string | null
          equipment_required?: string | null
          event_date?: string | null
          event_time?: string | null
          expected_end_at?: string | null
          host_responsibility_accepted_at?: string | null
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
          meeting_instructions?: string | null
          organizer_id?: string | null
          organizer_readiness_required?: boolean
          outcome_status?: string
          participation_type?: string | null
          place_address?: string | null
          place_categories?: string[] | null
          place_category_confidence?: number | null
          place_city?: string | null
          place_country?: string | null
          place_distance_m?: number | null
          place_lat?: number | null
          place_lon?: number | null
          place_name?: string | null
          place_source?: string | null
          private_location_reveal_hours?: number
          rating_count?: number
          readiness_enforcement_version?: string | null
          registrations_count?: number
          reschedule_version?: number
          source_origin?: string
          start_time?: string | null
          started_at?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string
          venue_validation_status?: string
          visibility_type?: string | null
          waitlist_enabled?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "events_ai_proposal_id_fkey"
            columns: ["ai_proposal_id"]
            isOneToOne: false
            referencedRelation: "ai_event_proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      experiment_guardrail_evaluations: {
        Row: {
          breached_guardrails: Json
          correlation_id: string
          evaluated_at: string
          experiment_id: string
          id: string
          outcome: string
        }
        Insert: {
          breached_guardrails?: Json
          correlation_id: string
          evaluated_at?: string
          experiment_id: string
          id?: string
          outcome: string
        }
        Update: {
          breached_guardrails?: Json
          correlation_id?: string
          evaluated_at?: string
          experiment_id?: string
          id?: string
          outcome?: string
        }
        Relationships: [
          {
            foreignKeyName: "experiment_guardrail_evaluations_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
        ]
      }
      experiment_guardrails: {
        Row: {
          auto_stop: boolean
          created_at: string
          direction: string
          experiment_id: string
          id: string
          metric_key: string
          minimum_sample_size: number
          threshold: number
        }
        Insert: {
          auto_stop?: boolean
          created_at?: string
          direction: string
          experiment_id: string
          id?: string
          metric_key: string
          minimum_sample_size?: number
          threshold: number
        }
        Update: {
          auto_stop?: boolean
          created_at?: string
          direction?: string
          experiment_id?: string
          id?: string
          metric_key?: string
          minimum_sample_size?: number
          threshold?: number
        }
        Relationships: [
          {
            foreignKeyName: "experiment_guardrails_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
        ]
      }
      experiment_metric_snapshots: {
        Row: {
          correlation_id: string
          experiment_id: string
          id: string
          metric_key: string
          metric_value: number
          recorded_at: string
          sample_size: number
          window_ended_at: string
          window_started_at: string
        }
        Insert: {
          correlation_id: string
          experiment_id: string
          id?: string
          metric_key: string
          metric_value: number
          recorded_at?: string
          sample_size: number
          window_ended_at: string
          window_started_at: string
        }
        Update: {
          correlation_id?: string
          experiment_id?: string
          id?: string
          metric_key?: string
          metric_value?: number
          recorded_at?: string
          sample_size?: number
          window_ended_at?: string
          window_started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "experiment_metric_snapshots_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
        ]
      }
      experiment_variants: {
        Row: {
          allocation_percentage: number
          config: Json
          created_at: string
          experiment_id: string
          id: string
          key: string
        }
        Insert: {
          allocation_percentage: number
          config?: Json
          created_at?: string
          experiment_id: string
          id?: string
          key: string
        }
        Update: {
          allocation_percentage?: number
          config?: Json
          created_at?: string
          experiment_id?: string
          id?: string
          key?: string
        }
        Relationships: [
          {
            foreignKeyName: "experiment_variants_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
        ]
      }
      experiments: {
        Row: {
          created_at: string
          created_by: string | null
          ends_at: string | null
          feature_flag_key: string
          hypothesis: string
          id: string
          key: string
          owner: string
          primary_metric: string
          starts_at: string | null
          status: string
          stop_reason: string | null
          stopped_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          feature_flag_key: string
          hypothesis: string
          id?: string
          key: string
          owner: string
          primary_metric: string
          starts_at?: string | null
          status?: string
          stop_reason?: string | null
          stopped_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          feature_flag_key?: string
          hypothesis?: string
          id?: string
          key?: string
          owner?: string
          primary_metric?: string
          starts_at?: string | null
          status?: string
          stop_reason?: string | null
          stopped_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "experiments_feature_flag_key_fkey"
            columns: ["feature_flag_key"]
            isOneToOne: false
            referencedRelation: "feature_flags"
            referencedColumns: ["key"]
          },
        ]
      }
      external_event_dedupe_reviews: {
        Row: {
          candidate_event_id: string
          confidence: number
          created_at: string
          id: string
          linked_at: string | null
          reason: string | null
          review_state: string
          reviewed_at: string | null
          reviewed_by: string | null
          source_event_id: string
        }
        Insert: {
          candidate_event_id: string
          confidence: number
          created_at?: string
          id?: string
          linked_at?: string | null
          reason?: string | null
          review_state?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_event_id: string
        }
        Update: {
          candidate_event_id?: string
          confidence?: number
          created_at?: string
          id?: string
          linked_at?: string | null
          reason?: string | null
          review_state?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_event_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_event_dedupe_reviews_candidate_event_id_fkey"
            columns: ["candidate_event_id"]
            isOneToOne: false
            referencedRelation: "external_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_event_dedupe_reviews_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "external_events"
            referencedColumns: ["id"]
          },
        ]
      }
      external_event_social_intent_audits: {
        Row: {
          created_at: string
          external_event_id: string
          id: string
          idempotency_key: string
          new_intent: string
          new_status: string
          previous_intent: string | null
          previous_status: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          external_event_id: string
          id?: string
          idempotency_key: string
          new_intent: string
          new_status: string
          previous_intent?: string | null
          previous_status?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          external_event_id?: string
          id?: string
          idempotency_key?: string
          new_intent?: string
          new_status?: string
          previous_intent?: string | null
          previous_status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_event_social_intent_audits_external_event_id_fkey"
            columns: ["external_event_id"]
            isOneToOne: false
            referencedRelation: "external_events"
            referencedColumns: ["id"]
          },
        ]
      }
      external_event_social_intents: {
        Row: {
          created_at: string
          external_event_id: string
          id: string
          intent: string
          status: string
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          created_at?: string
          external_event_id: string
          id?: string
          intent: string
          status?: string
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          created_at?: string
          external_event_id?: string
          id?: string
          intent?: string
          status?: string
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_event_social_intents_external_event_id_fkey"
            columns: ["external_event_id"]
            isOneToOne: false
            referencedRelation: "external_events"
            referencedColumns: ["id"]
          },
        ]
      }
      external_events: {
        Row: {
          canonical_fingerprint: string | null
          category: string | null
          created_at: string
          dedupe_confidence: number
          description: string | null
          event_date: string | null
          event_time: string | null
          external_id: string | null
          external_source: string
          external_url: string | null
          first_seen_at: string
          freshness_state: string
          id: string
          image_url: string | null
          import_state: string
          is_active: boolean
          last_verified_at: string | null
          location_address: string | null
          location_city: string | null
          location_free_text: string | null
          location_lat: number | null
          location_lon: number | null
          location_type: string | null
          max_attendees: number | null
          normalization_version: string
          provider_updated_at: string | null
          source_last_synced_at: string | null
          source_payload: Json
          subcategory: string | null
          tags: string[]
          title: string
        }
        Insert: {
          canonical_fingerprint?: string | null
          category?: string | null
          created_at?: string
          dedupe_confidence?: number
          description?: string | null
          event_date?: string | null
          event_time?: string | null
          external_id?: string | null
          external_source?: string
          external_url?: string | null
          first_seen_at?: string
          freshness_state?: string
          id?: string
          image_url?: string | null
          import_state?: string
          is_active?: boolean
          last_verified_at?: string | null
          location_address?: string | null
          location_city?: string | null
          location_free_text?: string | null
          location_lat?: number | null
          location_lon?: number | null
          location_type?: string | null
          max_attendees?: number | null
          normalization_version?: string
          provider_updated_at?: string | null
          source_last_synced_at?: string | null
          source_payload?: Json
          subcategory?: string | null
          tags?: string[]
          title: string
        }
        Update: {
          canonical_fingerprint?: string | null
          category?: string | null
          created_at?: string
          dedupe_confidence?: number
          description?: string | null
          event_date?: string | null
          event_time?: string | null
          external_id?: string | null
          external_source?: string
          external_url?: string | null
          first_seen_at?: string
          freshness_state?: string
          id?: string
          image_url?: string | null
          import_state?: string
          is_active?: boolean
          last_verified_at?: string | null
          location_address?: string | null
          location_city?: string | null
          location_free_text?: string | null
          location_lat?: number | null
          location_lon?: number | null
          location_type?: string | null
          max_attendees?: number | null
          normalization_version?: string
          provider_updated_at?: string | null
          source_last_synced_at?: string | null
          source_payload?: Json
          subcategory?: string | null
          tags?: string[]
          title?: string
        }
        Relationships: []
      }
      external_provider_dead_letters: {
        Row: {
          action: string
          attempt_count: number
          created_at: string
          error_code: string
          error_kind: string
          id: string
          next_retry_at: string | null
          payload_digest: string | null
          provider: string
          replay_idempotency_key: string | null
          replay_reason: string | null
          replay_requested_by: string | null
          resolved_at: string | null
          run_id: string | null
          safe_context: Json
          state: string
          updated_at: string
        }
        Insert: {
          action: string
          attempt_count?: number
          created_at?: string
          error_code: string
          error_kind: string
          id?: string
          next_retry_at?: string | null
          payload_digest?: string | null
          provider: string
          replay_idempotency_key?: string | null
          replay_reason?: string | null
          replay_requested_by?: string | null
          resolved_at?: string | null
          run_id?: string | null
          safe_context?: Json
          state?: string
          updated_at?: string
        }
        Update: {
          action?: string
          attempt_count?: number
          created_at?: string
          error_code?: string
          error_kind?: string
          id?: string
          next_retry_at?: string | null
          payload_digest?: string | null
          provider?: string
          replay_idempotency_key?: string | null
          replay_reason?: string | null
          replay_requested_by?: string | null
          resolved_at?: string | null
          run_id?: string | null
          safe_context?: Json
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_provider_dead_letters_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "external_provider_sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      external_provider_state: {
        Row: {
          circuit_open_until: string | null
          circuit_state: string
          consecutive_failures: number
          enabled: boolean
          estimated_cost_units: number
          last_checkpoint: Json
          last_error_at: string | null
          last_error_code: string | null
          last_error_kind: string | null
          last_success_at: string | null
          provider: string
          updated_at: string
        }
        Insert: {
          circuit_open_until?: string | null
          circuit_state?: string
          consecutive_failures?: number
          enabled?: boolean
          estimated_cost_units?: number
          last_checkpoint?: Json
          last_error_at?: string | null
          last_error_code?: string | null
          last_error_kind?: string | null
          last_success_at?: string | null
          provider: string
          updated_at?: string
        }
        Update: {
          circuit_open_until?: string | null
          circuit_state?: string
          consecutive_failures?: number
          enabled?: boolean
          estimated_cost_units?: number
          last_checkpoint?: Json
          last_error_at?: string | null
          last_error_code?: string | null
          last_error_kind?: string | null
          last_success_at?: string | null
          provider?: string
          updated_at?: string
        }
        Relationships: []
      }
      external_provider_sync_runs: {
        Row: {
          action: string
          attempt_count: number
          checkpoint: Json
          cost_units: number
          error_code: string | null
          error_kind: string | null
          failure_sample_redacted: string | null
          finished_at: string | null
          id: string
          item_count: number
          page_count: number
          provider: string
          replay_of: string | null
          started_at: string
          started_by: string | null
          status: string
        }
        Insert: {
          action: string
          attempt_count?: number
          checkpoint?: Json
          cost_units?: number
          error_code?: string | null
          error_kind?: string | null
          failure_sample_redacted?: string | null
          finished_at?: string | null
          id?: string
          item_count?: number
          page_count?: number
          provider: string
          replay_of?: string | null
          started_at?: string
          started_by?: string | null
          status?: string
        }
        Update: {
          action?: string
          attempt_count?: number
          checkpoint?: Json
          cost_units?: number
          error_code?: string | null
          error_kind?: string | null
          failure_sample_redacted?: string | null
          finished_at?: string | null
          id?: string
          item_count?: number
          page_count?: number
          provider?: string
          replay_of?: string | null
          started_at?: string
          started_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_provider_sync_runs_replay_of_fkey"
            columns: ["replay_of"]
            isOneToOne: false
            referencedRelation: "external_provider_sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flag_audit_log: {
        Row: {
          actor_id: string | null
          change_scope: string
          config_after: Json
          config_before: Json
          correlation_id: string
          created_at: string
          enabled_after: boolean
          enabled_before: boolean | null
          flag_key: string
          id: string
          idempotency_key: string
          reason: string
          rollout_after: number
          rollout_before: number | null
          subject_user_id: string | null
        }
        Insert: {
          actor_id?: string | null
          change_scope?: string
          config_after?: Json
          config_before?: Json
          correlation_id: string
          created_at?: string
          enabled_after: boolean
          enabled_before?: boolean | null
          flag_key: string
          id?: string
          idempotency_key: string
          reason: string
          rollout_after: number
          rollout_before?: number | null
          subject_user_id?: string | null
        }
        Update: {
          actor_id?: string | null
          change_scope?: string
          config_after?: Json
          config_before?: Json
          correlation_id?: string
          created_at?: string
          enabled_after?: boolean
          enabled_before?: boolean | null
          flag_key?: string
          id?: string
          idempotency_key?: string
          reason?: string
          rollout_after?: number
          rollout_before?: number | null
          subject_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feature_flag_audit_log_flag_key_fkey"
            columns: ["flag_key"]
            isOneToOne: false
            referencedRelation: "feature_flags"
            referencedColumns: ["key"]
          },
        ]
      }
      feature_flag_overrides: {
        Row: {
          created_at: string
          created_by: string | null
          enabled: boolean
          expires_at: string
          flag_key: string
          id: string
          reason: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          enabled: boolean
          expires_at: string
          flag_key: string
          id?: string
          reason: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          expires_at?: string
          flag_key?: string
          id?: string
          reason?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feature_flag_overrides_flag_key_fkey"
            columns: ["flag_key"]
            isOneToOne: false
            referencedRelation: "feature_flags"
            referencedColumns: ["key"]
          },
        ]
      }
      feature_flags: {
        Row: {
          cohorts: string[]
          created_at: string
          description: string
          eligibility_rule: Json
          enabled: boolean
          expires_at: string
          key: string
          owner: string
          rollout_percentage: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          cohorts?: string[]
          created_at?: string
          description: string
          eligibility_rule?: Json
          enabled?: boolean
          expires_at: string
          key: string
          owner: string
          rollout_percentage?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          cohorts?: string[]
          created_at?: string
          description?: string
          eligibility_rule?: Json
          enabled?: boolean
          expires_at?: string
          key?: string
          owner?: string
          rollout_percentage?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      financial_exception_queue: {
        Row: {
          assigned_to: string | null
          created_at: string
          id: string
          kind: string
          related_ref: string
          safe_summary: string
          severity: string
          state: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          id?: string
          kind: string
          related_ref: string
          safe_summary: string
          severity: string
          state?: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          id?: string
          kind?: string
          related_ref?: string
          safe_summary?: string
          severity?: string
          state?: string
          updated_at?: string
        }
        Relationships: []
      }
      first_event_confidence_access_audits: {
        Row: {
          accessed_fields: string[]
          actor_user_id: string | null
          created_at: string
          event_id: string
          id: string
          subject_user_id: string
        }
        Insert: {
          accessed_fields?: string[]
          actor_user_id?: string | null
          created_at?: string
          event_id: string
          id?: string
          subject_user_id: string
        }
        Update: {
          accessed_fields?: string[]
          actor_user_id?: string | null
          created_at?: string
          event_id?: string
          id?: string
          subject_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "first_event_confidence_access_audits_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      hobby_activities: {
        Row: {
          id: string
          name: string | null
          slug: string | null
        }
        Insert: {
          id?: string
          name?: string | null
          slug?: string | null
        }
        Update: {
          id?: string
          name?: string | null
          slug?: string | null
        }
        Relationships: []
      }
      moderation_actions: {
        Row: {
          action_type: string
          actor_id: string | null
          appeal_available: boolean
          case_id: string
          created_at: string
          evidence_refs: Json
          expires_at: string | null
          id: string
          idempotency_key: string
          policy_reason: string
          resource_state_before: Json
          starts_at: string
        }
        Insert: {
          action_type: string
          actor_id?: string | null
          appeal_available?: boolean
          case_id: string
          created_at?: string
          evidence_refs?: Json
          expires_at?: string | null
          id?: string
          idempotency_key: string
          policy_reason: string
          resource_state_before?: Json
          starts_at?: string
        }
        Update: {
          action_type?: string
          actor_id?: string | null
          appeal_available?: boolean
          case_id?: string
          created_at?: string
          evidence_refs?: Json
          expires_at?: string | null
          id?: string
          idempotency_key?: string
          policy_reason?: string
          resource_state_before?: Json
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "moderation_actions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "moderation_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_appeals: {
        Row: {
          appellant_id: string | null
          id: string
          moderation_action_id: string
          resolution_note: string | null
          resolved_at: string | null
          reviewer_id: string | null
          statement: string
          status: string
          submitted_at: string
        }
        Insert: {
          appellant_id?: string | null
          id?: string
          moderation_action_id: string
          resolution_note?: string | null
          resolved_at?: string | null
          reviewer_id?: string | null
          statement: string
          status?: string
          submitted_at?: string
        }
        Update: {
          appellant_id?: string | null
          id?: string
          moderation_action_id?: string
          resolution_note?: string | null
          resolved_at?: string | null
          reviewer_id?: string | null
          statement?: string
          status?: string
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "moderation_appeals_moderation_action_id_fkey"
            columns: ["moderation_action_id"]
            isOneToOne: false
            referencedRelation: "moderation_actions"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_case_notes: {
        Row: {
          author_id: string | null
          case_id: string
          created_at: string
          evidence_refs: Json
          id: string
          note: string
        }
        Insert: {
          author_id?: string | null
          case_id: string
          created_at?: string
          evidence_refs?: Json
          id?: string
          note: string
        }
        Update: {
          author_id?: string | null
          case_id?: string
          created_at?: string
          evidence_refs?: Json
          id?: string
          note?: string
        }
        Relationships: [
          {
            foreignKeyName: "moderation_case_notes_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "moderation_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_cases: {
        Row: {
          assignee_id: string | null
          closed_at: string | null
          created_at: string
          id: string
          internal_summary: string | null
          report_id: string
          severity: string
          status: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          closed_at?: string | null
          created_at?: string
          id?: string
          internal_summary?: string | null
          report_id: string
          severity: string
          status?: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          closed_at?: string | null
          created_at?: string
          id?: string
          internal_summary?: string | null
          report_id?: string
          severity?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "moderation_cases_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: true
            referencedRelation: "user_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_resource_enforcements: {
        Row: {
          expires_at: string | null
          id: string
          moderation_action_id: string
          restriction_type: string
          revoked_at: string | null
          revoked_by: string | null
          starts_at: string
          target_ref: string
          target_type: string
        }
        Insert: {
          expires_at?: string | null
          id?: string
          moderation_action_id: string
          restriction_type: string
          revoked_at?: string | null
          revoked_by?: string | null
          starts_at?: string
          target_ref: string
          target_type: string
        }
        Update: {
          expires_at?: string | null
          id?: string
          moderation_action_id?: string
          restriction_type?: string
          revoked_at?: string | null
          revoked_by?: string | null
          starts_at?: string
          target_ref?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "moderation_resource_enforcements_moderation_action_id_fkey"
            columns: ["moderation_action_id"]
            isOneToOne: true
            referencedRelation: "moderation_actions"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_delivery_attempts: {
        Row: {
          attempt_number: number
          channel: string
          completed_at: string | null
          created_at: string
          error_code: string | null
          id: string
          next_retry_at: string | null
          notification_id: string
          provider: string | null
          provider_message_id: string | null
          provider_response_code: string | null
          retryable: boolean
          safe_metadata: Json
          status: string
        }
        Insert: {
          attempt_number: number
          channel: string
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          id?: string
          next_retry_at?: string | null
          notification_id: string
          provider?: string | null
          provider_message_id?: string | null
          provider_response_code?: string | null
          retryable?: boolean
          safe_metadata?: Json
          status: string
        }
        Update: {
          attempt_number?: number
          channel?: string
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          id?: string
          next_retry_at?: string | null
          notification_id?: string
          provider?: string | null
          provider_message_id?: string | null
          provider_response_code?: string | null
          retryable?: boolean
          safe_metadata?: Json
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_delivery_attempts_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_digest_batches: {
        Row: {
          created_at: string
          delivered_at: string | null
          digest_mode: string
          id: string
          item_count: number
          status: string
          user_id: string
          window_key: string
        }
        Insert: {
          created_at?: string
          delivered_at?: string | null
          digest_mode: string
          id?: string
          item_count: number
          status?: string
          user_id: string
          window_key: string
        }
        Update: {
          created_at?: string
          delivered_at?: string | null
          digest_mode?: string
          id?: string
          item_count?: number
          status?: string
          user_id?: string
          window_key?: string
        }
        Relationships: []
      }
      notification_digest_items: {
        Row: {
          created_at: string
          digest_id: string
          notification_id: string
        }
        Insert: {
          created_at?: string
          digest_id: string
          notification_id: string
        }
        Update: {
          created_at?: string
          digest_id?: string
          notification_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_digest_items_digest_id_fkey"
            columns: ["digest_id"]
            isOneToOne: false
            referencedRelation: "notification_digest_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_digest_items_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: true
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          community_enabled: boolean
          created_at: string
          digest_mode: string
          email_enabled: boolean
          event_invite: boolean
          favorite_category_event: boolean
          frequency_cap_per_day: number
          friend_request: boolean
          id: string
          in_app_enabled: boolean
          marketing_enabled: boolean
          organizer_enabled: boolean
          push_enabled: boolean
          quiet_end: string
          quiet_hours_enabled: boolean
          quiet_start: string
          recommendation_enabled: boolean
          timezone: string
          transactional_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          community_enabled?: boolean
          created_at?: string
          digest_mode?: string
          email_enabled?: boolean
          event_invite?: boolean
          favorite_category_event?: boolean
          frequency_cap_per_day?: number
          friend_request?: boolean
          id?: string
          in_app_enabled?: boolean
          marketing_enabled?: boolean
          organizer_enabled?: boolean
          push_enabled?: boolean
          quiet_end?: string
          quiet_hours_enabled?: boolean
          quiet_start?: string
          recommendation_enabled?: boolean
          timezone?: string
          transactional_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          community_enabled?: boolean
          created_at?: string
          digest_mode?: string
          email_enabled?: boolean
          event_invite?: boolean
          favorite_category_event?: boolean
          frequency_cap_per_day?: number
          friend_request?: boolean
          id?: string
          in_app_enabled?: boolean
          marketing_enabled?: boolean
          organizer_enabled?: boolean
          push_enabled?: boolean
          quiet_end?: string
          quiet_hours_enabled?: boolean
          quiet_start?: string
          recommendation_enabled?: boolean
          timezone?: string
          transactional_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_templates: {
        Row: {
          body_template: string | null
          category: string
          created_at: string
          created_by: string | null
          is_active: boolean
          locale: string
          notification_type: string
          template_key: string
          title_template: string
          version: number
        }
        Insert: {
          body_template?: string | null
          category: string
          created_at?: string
          created_by?: string | null
          is_active?: boolean
          locale?: string
          notification_type: string
          template_key: string
          title_template: string
          version: number
        }
        Update: {
          body_template?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          is_active?: boolean
          locale?: string
          notification_type?: string
          template_key?: string
          title_template?: string
          version?: number
        }
        Relationships: []
      }
      notifications: {
        Row: {
          actor_user_id: string | null
          attempt_count: number
          body: string | null
          category: string
          channel: string
          claim_expires_at: string | null
          claim_token: string | null
          claimed_at: string | null
          correlation_id: string
          created_at: string
          data: Json | null
          dedupe_key: string | null
          deep_link: string | null
          delivered_at: string | null
          delivery_status: string
          event_key: string | null
          expires_at: string | null
          id: string
          is_read: boolean
          last_error_code: string | null
          priority: number
          read_at: string | null
          scheduled_at: string
          sent_at: string | null
          source_id: string | null
          source_type: string | null
          suppression_reason: string | null
          template_key: string | null
          template_version: number
          title: string
          type: string
          user_id: string
        }
        Insert: {
          actor_user_id?: string | null
          attempt_count?: number
          body?: string | null
          category?: string
          channel?: string
          claim_expires_at?: string | null
          claim_token?: string | null
          claimed_at?: string | null
          correlation_id?: string
          created_at?: string
          data?: Json | null
          dedupe_key?: string | null
          deep_link?: string | null
          delivered_at?: string | null
          delivery_status?: string
          event_key?: string | null
          expires_at?: string | null
          id?: string
          is_read?: boolean
          last_error_code?: string | null
          priority?: number
          read_at?: string | null
          scheduled_at?: string
          sent_at?: string | null
          source_id?: string | null
          source_type?: string | null
          suppression_reason?: string | null
          template_key?: string | null
          template_version?: number
          title: string
          type: string
          user_id: string
        }
        Update: {
          actor_user_id?: string | null
          attempt_count?: number
          body?: string | null
          category?: string
          channel?: string
          claim_expires_at?: string | null
          claim_token?: string | null
          claimed_at?: string | null
          correlation_id?: string
          created_at?: string
          data?: Json | null
          dedupe_key?: string | null
          deep_link?: string | null
          delivered_at?: string | null
          delivery_status?: string
          event_key?: string | null
          expires_at?: string | null
          id?: string
          is_read?: boolean
          last_error_code?: string | null
          priority?: number
          read_at?: string | null
          scheduled_at?: string
          sent_at?: string | null
          source_id?: string | null
          source_type?: string | null
          suppression_reason?: string | null
          template_key?: string | null
          template_version?: number
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      operations_inbox_history: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          from_state: string | null
          id: string
          item_id: string
          reason: string | null
          safe_metadata: Json
          to_state: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          from_state?: string | null
          id?: string
          item_id: string
          reason?: string | null
          safe_metadata?: Json
          to_state?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          from_state?: string | null
          id?: string
          item_id?: string
          reason?: string | null
          safe_metadata?: Json
          to_state?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operations_inbox_history_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "operations_inbox_items"
            referencedColumns: ["id"]
          },
        ]
      }
      operations_inbox_items: {
        Row: {
          acknowledged_at: string | null
          assigned_to: string | null
          created_at: string
          dedupe_key: string
          first_seen_at: string
          id: string
          last_seen_at: string
          related_entities: Json
          resolution_reason: string | null
          resolved_at: string | null
          safe_deep_link: string
          safe_summary: string
          severity: string
          sla_target_at: string
          source_domain: string
          source_ref: string
          state: string
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          acknowledged_at?: string | null
          assigned_to?: string | null
          created_at?: string
          dedupe_key: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          related_entities?: Json
          resolution_reason?: string | null
          resolved_at?: string | null
          safe_deep_link?: string
          safe_summary: string
          severity: string
          sla_target_at: string
          source_domain: string
          source_ref: string
          state?: string
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          acknowledged_at?: string | null
          assigned_to?: string | null
          created_at?: string
          dedupe_key?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          related_entities?: Json
          resolution_reason?: string | null
          resolved_at?: string | null
          safe_deep_link?: string
          safe_summary?: string
          severity?: string
          sla_target_at?: string
          source_domain?: string
          source_ref?: string
          state?: string
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      organizer_incident_handoffs: {
        Row: {
          assigned_owner_user_id: string | null
          created_at: string
          event_id: string
          id: string
          idempotency_key: string
          incident_type: string
          reporter_user_id: string
          resolution_note: string | null
          resolved_at: string | null
          severity: string
          state: string
          summary: string
          updated_at: string
        }
        Insert: {
          assigned_owner_user_id?: string | null
          created_at?: string
          event_id: string
          id?: string
          idempotency_key: string
          incident_type: string
          reporter_user_id: string
          resolution_note?: string | null
          resolved_at?: string | null
          severity: string
          state?: string
          summary: string
          updated_at?: string
        }
        Update: {
          assigned_owner_user_id?: string | null
          created_at?: string
          event_id?: string
          id?: string
          idempotency_key?: string
          incident_type?: string
          reporter_user_id?: string
          resolution_note?: string | null
          resolved_at?: string | null
          severity?: string
          state?: string
          summary?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizer_incident_handoffs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      organizer_readiness_assessments: {
        Row: {
          assessed_at: string
          assessed_by: string | null
          checklist: Json
          checklist_version: string
          enforcement_state: string
          event_id: string
          updated_at: string
        }
        Insert: {
          assessed_at?: string
          assessed_by?: string | null
          checklist?: Json
          checklist_version?: string
          enforcement_state?: string
          event_id: string
          updated_at?: string
        }
        Update: {
          assessed_at?: string
          assessed_by?: string | null
          checklist?: Json
          checklist_version?: string
          enforcement_state?: string
          event_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizer_readiness_assessments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
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
      places_local_catalog: {
        Row: {
          first_seen_at: string
          freshness_state: string
          id: string
          import_state: string
          last_verified_at: string | null
          normalization_version: string
          source_confidence: number | null
          source_url: string | null
          synced_at: string | null
          updated_at: string
        }
        Insert: {
          first_seen_at?: string
          freshness_state?: string
          id?: string
          import_state?: string
          last_verified_at?: string | null
          normalization_version?: string
          source_confidence?: number | null
          source_url?: string | null
          synced_at?: string | null
          updated_at?: string
        }
        Update: {
          first_seen_at?: string
          freshness_state?: string
          id?: string
          import_state?: string
          last_verified_at?: string | null
          normalization_version?: string
          source_confidence?: number | null
          source_url?: string | null
          synced_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      plan_features: {
        Row: {
          config: Json
          feature_key: string
          limit_value: number | null
          plan_key: string
        }
        Insert: {
          config?: Json
          feature_key: string
          limit_value?: number | null
          plan_key: string
        }
        Update: {
          config?: Json
          feature_key?: string
          limit_value?: number | null
          plan_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_features_plan_key_fkey"
            columns: ["plan_key"]
            isOneToOne: false
            referencedRelation: "product_plans"
            referencedColumns: ["key"]
          },
        ]
      }
      post_event_feedback: {
        Row: {
          created_at: string
          description_accuracy: number | null
          event_id: string
          felt_safe: boolean | null
          id: string
          private_note: string | null
          updated_at: string
          user_id: string
          would_return: boolean | null
        }
        Insert: {
          created_at?: string
          description_accuracy?: number | null
          event_id: string
          felt_safe?: boolean | null
          id?: string
          private_note?: string | null
          updated_at?: string
          user_id: string
          would_return?: boolean | null
        }
        Update: {
          created_at?: string
          description_accuracy?: number | null
          event_id?: string
          felt_safe?: boolean | null
          id?: string
          private_note?: string | null
          updated_at?: string
          user_id?: string
          would_return?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "post_event_feedback_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      product_analytics_events: {
        Row: {
          actor_pseudonym: string | null
          correlation_id: string
          event_name: string
          id: string
          idempotency_key: string
          occurred_at: string
          properties: Json
          received_at: string
          redacted_at: string | null
          retention_until: string
          schema_version: number
          session_pseudonym: string | null
          source: string
        }
        Insert: {
          actor_pseudonym?: string | null
          correlation_id: string
          event_name: string
          id?: string
          idempotency_key: string
          occurred_at: string
          properties?: Json
          received_at?: string
          redacted_at?: string | null
          retention_until?: string
          schema_version?: number
          session_pseudonym?: string | null
          source: string
        }
        Update: {
          actor_pseudonym?: string | null
          correlation_id?: string
          event_name?: string
          id?: string
          idempotency_key?: string
          occurred_at?: string
          properties?: Json
          received_at?: string
          redacted_at?: string | null
          retention_until?: string
          schema_version?: number
          session_pseudonym?: string | null
          source?: string
        }
        Relationships: []
      }
      product_plans: {
        Row: {
          amount_minor: number | null
          audience: string
          billing_interval: string | null
          created_at: string
          currency: string | null
          key: string
          name: string
          provider_key: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount_minor?: number | null
          audience: string
          billing_interval?: string | null
          created_at?: string
          currency?: string | null
          key: string
          name: string
          provider_key?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount_minor?: number | null
          audience?: string
          billing_interval?: string | null
          created_at?: string
          currency?: string | null
          key?: string
          name?: string
          provider_key?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      profile_first_event_confidence: {
        Row: {
          accessibility_needs: string | null
          beginner_friendly: boolean | null
          communication_preference: string | null
          created_at: string
          preferred_event_formats: string[]
          preferred_group_size: string | null
          solo_arrival_comfort: string | null
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          accessibility_needs?: string | null
          beginner_friendly?: boolean | null
          communication_preference?: string | null
          created_at?: string
          preferred_event_formats?: string[]
          preferred_group_size?: string | null
          solo_arrival_comfort?: string | null
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          accessibility_needs?: string | null
          beginner_friendly?: boolean | null
          communication_preference?: string | null
          created_at?: string
          preferred_event_formats?: string[]
          preferred_group_size?: string | null
          solo_arrival_comfort?: string | null
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: []
      }
      profile_hobby_preferences: {
        Row: {
          activity_id: string
          created_at: string
          experience_level: string | null
          id: string
          interest_level: string
          last_synced_at: string
          preferred_modes: string[]
          sync_source: string
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          activity_id: string
          created_at?: string
          experience_level?: string | null
          id?: string
          interest_level?: string
          last_synced_at?: string
          preferred_modes?: string[]
          sync_source?: string
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          activity_id?: string
          created_at?: string
          experience_level?: string | null
          id?: string
          interest_level?: string
          last_synced_at?: string
          preferred_modes?: string[]
          sync_source?: string
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_hobby_preferences_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "hobby_activities"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          accessibility_needs: string | null
          address: string | null
          address_public: boolean
          age_public: boolean
          availability_window: Json
          avatar_url: string | null
          beginner_friendly_preference: boolean | null
          bio: string | null
          city: string | null
          communication_preference: string | null
          created_at: string
          date_of_birth: string | null
          display_name: string | null
          district: string | null
          favorite_event_categories: string[] | null
          gender: string | null
          gender_public: boolean
          hobbies: string[] | null
          id: string
          interests_visibility: string
          is_active: boolean
          location_lat: number | null
          location_lon: number | null
          location_precision: string
          notification_consent_at: string | null
          onboarding_completed_at: string | null
          onboarding_step: number
          preferred_activity_modes: string[]
          preferred_group_size: string | null
          preferred_radius_km: number | null
          privacy_consent_at: string | null
          profile_visibility: string
          solo_arrival_comfort: string | null
          updated_at: string
          user_id: string | null
          user_origin: string
        }
        Insert: {
          accessibility_needs?: string | null
          address?: string | null
          address_public?: boolean
          age_public?: boolean
          availability_window?: Json
          avatar_url?: string | null
          beginner_friendly_preference?: boolean | null
          bio?: string | null
          city?: string | null
          communication_preference?: string | null
          created_at?: string
          date_of_birth?: string | null
          display_name?: string | null
          district?: string | null
          favorite_event_categories?: string[] | null
          gender?: string | null
          gender_public?: boolean
          hobbies?: string[] | null
          id?: string
          interests_visibility?: string
          is_active?: boolean
          location_lat?: number | null
          location_lon?: number | null
          location_precision?: string
          notification_consent_at?: string | null
          onboarding_completed_at?: string | null
          onboarding_step?: number
          preferred_activity_modes?: string[]
          preferred_group_size?: string | null
          preferred_radius_km?: number | null
          privacy_consent_at?: string | null
          profile_visibility?: string
          solo_arrival_comfort?: string | null
          updated_at?: string
          user_id?: string | null
          user_origin?: string
        }
        Update: {
          accessibility_needs?: string | null
          address?: string | null
          address_public?: boolean
          age_public?: boolean
          availability_window?: Json
          avatar_url?: string | null
          beginner_friendly_preference?: boolean | null
          bio?: string | null
          city?: string | null
          communication_preference?: string | null
          created_at?: string
          date_of_birth?: string | null
          display_name?: string | null
          district?: string | null
          favorite_event_categories?: string[] | null
          gender?: string | null
          gender_public?: boolean
          hobbies?: string[] | null
          id?: string
          interests_visibility?: string
          is_active?: boolean
          location_lat?: number | null
          location_lon?: number | null
          location_precision?: string
          notification_consent_at?: string | null
          onboarding_completed_at?: string | null
          onboarding_step?: number
          preferred_activity_modes?: string[]
          preferred_group_size?: string | null
          preferred_radius_km?: number | null
          privacy_consent_at?: string | null
          profile_visibility?: string
          solo_arrival_comfort?: string | null
          updated_at?: string
          user_id?: string | null
          user_origin?: string
        }
        Relationships: []
      }
      promoted_experiences: {
        Row: {
          created_at: string
          created_by: string | null
          disclosure_label: string
          ends_at: string
          event_id: string
          id: string
          policy_reason: string
          policy_status: string
          quality_score: number
          relevance_score: number
          reviewed_at: string | null
          reviewed_by: string | null
          starts_at: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          disclosure_label?: string
          ends_at: string
          event_id: string
          id?: string
          policy_reason: string
          policy_status?: string
          quality_score: number
          relevance_score: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          starts_at: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          disclosure_label?: string
          ends_at?: string
          event_id?: string
          id?: string
          policy_reason?: string
          policy_status?: string
          quality_score?: number
          relevance_score?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          starts_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "promoted_experiences_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      reconnection_preferences: {
        Row: {
          decided_at: string
          decision: string
          encounter_id: string
          id: string
          revoked_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          decided_at?: string
          decision: string
          encounter_id: string
          id?: string
          revoked_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          decided_at?: string
          decision?: string
          encounter_id?: string
          id?: string
          revoked_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reconnection_preferences_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "event_encounters"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_role_snapshot: string
          case_id: string | null
          correlation_id: string
          created_at: string
          id: string
          idempotency_key: string
          outcome: string
          reason_code: string | null
          redacted_metadata: Json
          retention_until: string
          target_ref: string
          target_type: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role_snapshot: string
          case_id?: string | null
          correlation_id: string
          created_at?: string
          id?: string
          idempotency_key: string
          outcome: string
          reason_code?: string | null
          redacted_metadata?: Json
          retention_until?: string
          target_ref: string
          target_type: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role_snapshot?: string
          case_id?: string | null
          correlation_id?: string
          created_at?: string
          id?: string
          idempotency_key?: string
          outcome?: string
          reason_code?: string | null
          redacted_metadata?: Json
          retention_until?: string
          target_ref?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "safety_audit_log_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "moderation_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_enforcements: {
        Row: {
          expires_at: string | null
          feature_key: string | null
          id: string
          moderation_action_id: string
          restriction_type: string
          revoked_at: string | null
          revoked_by: string | null
          starts_at: string
          target_user_id: string | null
        }
        Insert: {
          expires_at?: string | null
          feature_key?: string | null
          id?: string
          moderation_action_id: string
          restriction_type: string
          revoked_at?: string | null
          revoked_by?: string | null
          starts_at?: string
          target_user_id?: string | null
        }
        Update: {
          expires_at?: string | null
          feature_key?: string | null
          id?: string
          moderation_action_id?: string
          restriction_type?: string
          revoked_at?: string | null
          revoked_by?: string | null
          starts_at?: string
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "safety_enforcements_moderation_action_id_fkey"
            columns: ["moderation_action_id"]
            isOneToOne: true
            referencedRelation: "moderation_actions"
            referencedColumns: ["id"]
          },
        ]
      }
      social_circle_events: {
        Row: {
          circle_id: string
          created_at: string
          event_id: string
        }
        Insert: {
          circle_id: string
          created_at?: string
          event_id: string
        }
        Update: {
          circle_id?: string
          created_at?: string
          event_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_circle_events_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circle_health_dashboard"
            referencedColumns: ["circle_id"]
          },
          {
            foreignKeyName: "social_circle_events_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "social_circles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_circle_events_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      social_circle_members: {
        Row: {
          circle_id: string
          created_at: string
          id: string
          joined_at: string | null
          left_at: string | null
          membership_status: string
          role: string
          rules_consented_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          circle_id: string
          created_at?: string
          id?: string
          joined_at?: string | null
          left_at?: string | null
          membership_status?: string
          role?: string
          rules_consented_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          circle_id?: string
          created_at?: string
          id?: string
          joined_at?: string | null
          left_at?: string | null
          membership_status?: string
          role?: string
          rules_consented_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_circle_members_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circle_health_dashboard"
            referencedColumns: ["circle_id"]
          },
          {
            foreignKeyName: "social_circle_members_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "social_circles"
            referencedColumns: ["id"]
          },
        ]
      }
      social_circles: {
        Row: {
          archived_at: string | null
          cadence: string
          capacity: number
          created_at: string
          created_by: string
          creation_key: string | null
          guardian_id: string | null
          host_id: string
          id: string
          lifecycle_state: string
          membership_policy: string
          name: string
          purpose: string
          safety_rules: string | null
          updated_at: string
          venue_preference: string | null
          visibility: string
        }
        Insert: {
          archived_at?: string | null
          cadence?: string
          capacity?: number
          created_at?: string
          created_by: string
          creation_key?: string | null
          guardian_id?: string | null
          host_id: string
          id?: string
          lifecycle_state?: string
          membership_policy?: string
          name: string
          purpose: string
          safety_rules?: string | null
          updated_at?: string
          venue_preference?: string | null
          visibility?: string
        }
        Update: {
          archived_at?: string | null
          cadence?: string
          capacity?: number
          created_at?: string
          created_by?: string
          creation_key?: string | null
          guardian_id?: string | null
          host_id?: string
          id?: string
          lifecycle_state?: string
          membership_policy?: string
          name?: string
          purpose?: string
          safety_rules?: string | null
          updated_at?: string
          venue_preference?: string | null
          visibility?: string
        }
        Relationships: []
      }
      social_graph_audit_events: {
        Row: {
          actor_id: string | null
          created_at: string
          entity_id: string
          entity_type: string
          event_type: string
          id: string
          metadata: Json
          subject_user_id: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          event_type: string
          id?: string
          metadata?: Json
          subject_user_id?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          event_type?: string
          id?: string
          metadata?: Json
          subject_user_id?: string | null
        }
        Relationships: []
      }
      user_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          id: string
          reason_code: string | null
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
          id?: string
          reason_code?: string | null
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          id?: string
          reason_code?: string | null
        }
        Relationships: []
      }
      user_push_subscriptions: {
        Row: {
          auth_secret: string
          created_at: string
          endpoint: string
          endpoint_hash: string
          expiration_time: string | null
          id: string
          last_seen_at: string
          p256dh: string
          revoked_at: string | null
          updated_at: string
          user_agent_family: string | null
          user_id: string
        }
        Insert: {
          auth_secret: string
          created_at?: string
          endpoint: string
          endpoint_hash: string
          expiration_time?: string | null
          id?: string
          last_seen_at?: string
          p256dh: string
          revoked_at?: string | null
          updated_at?: string
          user_agent_family?: string | null
          user_id: string
        }
        Update: {
          auth_secret?: string
          created_at?: string
          endpoint?: string
          endpoint_hash?: string
          expiration_time?: string | null
          id?: string
          last_seen_at?: string
          p256dh?: string
          revoked_at?: string | null
          updated_at?: string
          user_agent_family?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_reports: {
        Row: {
          category: string
          context_id: string | null
          context_type: string
          created_at: string
          details: string | null
          id: string
          idempotency_key: string | null
          redacted_at: string | null
          reported_user_id: string | null
          reporter_id: string
          retention_until: string
          severity: string
          source_surface: string
          status: string
          target_ref: string
          updated_at: string
        }
        Insert: {
          category: string
          context_id?: string | null
          context_type?: string
          created_at?: string
          details?: string | null
          id?: string
          idempotency_key?: string | null
          redacted_at?: string | null
          reported_user_id?: string | null
          reporter_id: string
          retention_until?: string
          severity?: string
          source_surface?: string
          status?: string
          target_ref: string
          updated_at?: string
        }
        Update: {
          category?: string
          context_id?: string | null
          context_type?: string
          created_at?: string
          details?: string | null
          id?: string
          idempotency_key?: string | null
          redacted_at?: string | null
          reported_user_id?: string | null
          reporter_id?: string
          retention_until?: string
          severity?: string
          source_surface?: string
          status?: string
          target_ref?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          role: Database["public"]["Enums"]["app_role"] | null
          user_id: string | null
        }
        Insert: {
          role?: Database["public"]["Enums"]["app_role"] | null
          user_id?: string | null
        }
        Update: {
          role?: Database["public"]["Enums"]["app_role"] | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_session_devices: {
        Row: {
          device_label: string
          first_seen_at: string
          id: string
          last_seen_at: string
          revoked_at: string | null
          session_fingerprint: string
          user_agent_family: string | null
          user_id: string
        }
        Insert: {
          device_label?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          revoked_at?: string | null
          session_fingerprint: string
          user_agent_family?: string | null
          user_id: string
        }
        Update: {
          device_label?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          revoked_at?: string | null
          session_fingerprint?: string
          user_agent_family?: string | null
          user_id?: string
        }
        Relationships: []
      }
      virtual_hub_activation_events: {
        Row: {
          dedupe_key: string
          hub_id: string
          id: string
          metadata: Json
          occurred_at: string
          source: string
          stage: string
          user_id: string | null
        }
        Insert: {
          dedupe_key: string
          hub_id: string
          id?: string
          metadata?: Json
          occurred_at?: string
          source?: string
          stage: string
          user_id?: string | null
        }
        Update: {
          dedupe_key?: string
          hub_id?: string
          id?: string
          metadata?: Json
          occurred_at?: string
          source?: string
          stage?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "virtual_hub_activation_events_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "virtual_hub_discovery_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "virtual_hub_activation_events_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "virtual_hubs"
            referencedColumns: ["id"]
          },
        ]
      }
      virtual_hub_activity_consumption_failures: {
        Row: {
          created_at: string
          error_code: string
          error_message: string
          event_id: string | null
          id: string
          participation_status: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          error_code: string
          error_message: string
          event_id?: string | null
          id?: string
          participation_status?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          error_code?: string
          error_message?: string
          event_id?: string | null
          id?: string
          participation_status?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "virtual_hub_activity_consumption_failures_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      virtual_hub_admin_audit_events: {
        Row: {
          action: string
          actor_id: string | null
          after_state: Json | null
          before_state: Json | null
          created_at: string
          hub_id: string | null
          id: string
          idempotency_key: string | null
          reason: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          hub_id?: string | null
          id?: string
          idempotency_key?: string | null
          reason?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          hub_id?: string | null
          id?: string
          idempotency_key?: string | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "virtual_hub_admin_audit_events_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "virtual_hub_discovery_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "virtual_hub_admin_audit_events_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "virtual_hubs"
            referencedColumns: ["id"]
          },
        ]
      }
      virtual_hub_members: {
        Row: {
          first_activity_at: string | null
          first_attendance_at: string | null
          hub_id: string
          id: string
          join_source: string
          joined_at: string
          left_at: string | null
          membership_status: string
          policy_acknowledged_at: string | null
          repeat_activity_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          first_activity_at?: string | null
          first_attendance_at?: string | null
          hub_id: string
          id?: string
          join_source?: string
          joined_at?: string
          left_at?: string | null
          membership_status?: string
          policy_acknowledged_at?: string | null
          repeat_activity_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          first_activity_at?: string | null
          first_attendance_at?: string | null
          hub_id?: string
          id?: string
          join_source?: string
          joined_at?: string
          left_at?: string | null
          membership_status?: string
          policy_acknowledged_at?: string | null
          repeat_activity_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "virtual_hub_members_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "virtual_hub_discovery_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "virtual_hub_members_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "virtual_hubs"
            referencedColumns: ["id"]
          },
        ]
      }
      virtual_hub_moderation_items: {
        Row: {
          assigned_to: string | null
          created_at: string
          hub_id: string
          id: string
          item_type: string
          report_id: string | null
          resolution_key: string | null
          resolution_note: string | null
          resolved_at: string | null
          status: string
          subject_user_id: string | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          hub_id: string
          id?: string
          item_type: string
          report_id?: string | null
          resolution_key?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          status?: string
          subject_user_id?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          hub_id?: string
          id?: string
          item_type?: string
          report_id?: string | null
          resolution_key?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          status?: string
          subject_user_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "virtual_hub_moderation_items_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "virtual_hub_discovery_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "virtual_hub_moderation_items_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "virtual_hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "virtual_hub_moderation_items_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "user_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      virtual_hub_reconciliation_runs: {
        Row: {
          completed_at: string | null
          error_code: string | null
          error_message: string | null
          hubs_touched: number
          id: string
          idempotency_key: string
          memberships_added: number
          memberships_reactivated: number
          memberships_soft_left: number
          metadata: Json
          requested_by: string | null
          run_type: string
          started_at: string
          status: string
          target_user_id: string | null
        }
        Insert: {
          completed_at?: string | null
          error_code?: string | null
          error_message?: string | null
          hubs_touched?: number
          id?: string
          idempotency_key: string
          memberships_added?: number
          memberships_reactivated?: number
          memberships_soft_left?: number
          metadata?: Json
          requested_by?: string | null
          run_type?: string
          started_at?: string
          status?: string
          target_user_id?: string | null
        }
        Update: {
          completed_at?: string | null
          error_code?: string | null
          error_message?: string | null
          hubs_touched?: number
          id?: string
          idempotency_key?: string
          memberships_added?: number
          memberships_reactivated?: number
          memberships_soft_left?: number
          metadata?: Json
          requested_by?: string | null
          run_type?: string
          started_at?: string
          status?: string
          target_user_id?: string | null
        }
        Relationships: []
      }
      virtual_hubs: {
        Row: {
          activity_freshness_at: string | null
          archive_eligible_at: string | null
          archived_at: string | null
          availability_overlap_count: number
          beginner_friendly: boolean
          city: string | null
          community_rules: string | null
          created_at: string
          generated_member_count: number
          hobby_activity: string | null
          hobby_category: string
          hobby_subcategory: string | null
          host_claimed_at: string | null
          host_id: string | null
          id: string
          identity_key: string
          is_discoverable: boolean
          join_policy: string
          last_reconciled_at: string | null
          lifecycle_state: string
          member_count: number
          organizer_presence_count: number
          purpose: string | null
          qualification_reasons: Json
          qualification_score: number
          reactivation_requested_at: string | null
          real_member_count: number
          recent_real_member_count: number
          unknown_member_count: number
          upcoming_event_count: number
          updated_at: string
          welcome_message: string | null
        }
        Insert: {
          activity_freshness_at?: string | null
          archive_eligible_at?: string | null
          archived_at?: string | null
          availability_overlap_count?: number
          beginner_friendly?: boolean
          city?: string | null
          community_rules?: string | null
          created_at?: string
          generated_member_count?: number
          hobby_activity?: string | null
          hobby_category: string
          hobby_subcategory?: string | null
          host_claimed_at?: string | null
          host_id?: string | null
          id?: string
          identity_key: string
          is_discoverable?: boolean
          join_policy?: string
          last_reconciled_at?: string | null
          lifecycle_state?: string
          member_count?: number
          organizer_presence_count?: number
          purpose?: string | null
          qualification_reasons?: Json
          qualification_score?: number
          reactivation_requested_at?: string | null
          real_member_count?: number
          recent_real_member_count?: number
          unknown_member_count?: number
          upcoming_event_count?: number
          updated_at?: string
          welcome_message?: string | null
        }
        Update: {
          activity_freshness_at?: string | null
          archive_eligible_at?: string | null
          archived_at?: string | null
          availability_overlap_count?: number
          beginner_friendly?: boolean
          city?: string | null
          community_rules?: string | null
          created_at?: string
          generated_member_count?: number
          hobby_activity?: string | null
          hobby_category?: string
          hobby_subcategory?: string | null
          host_claimed_at?: string | null
          host_id?: string | null
          id?: string
          identity_key?: string
          is_discoverable?: boolean
          join_policy?: string
          last_reconciled_at?: string | null
          lifecycle_state?: string
          member_count?: number
          organizer_presence_count?: number
          purpose?: string | null
          qualification_reasons?: Json
          qualification_score?: number
          reactivation_requested_at?: string | null
          real_member_count?: number
          recent_real_member_count?: number
          unknown_member_count?: number
          upcoming_event_count?: number
          updated_at?: string
          welcome_message?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      circle_health_dashboard: {
        Row: {
          active_members: number | null
          cadence_status: string | null
          circle_id: string | null
          event_count: number | null
          events_30d: number | null
          host_id: string | null
          host_load: number | null
          last_activity_at: string | null
          name: string | null
          new_members_30d: number | null
          next_event_at: string | null
          no_show_rate: number | null
          open_report_count: number | null
          pending_requests: number | null
          prior_reports_30d: number | null
          reports_30d: number | null
          returning_attendees: number | null
          returning_rate: number | null
        }
        Relationships: []
      }
      product_outcome_daily: {
        Row: {
          event_count: number | null
          event_name: string | null
          outcome_day: string | null
        }
        Relationships: []
      }
      promoted_experience_candidates: {
        Row: {
          disclosure_label: string | null
          ends_at: string | null
          event_id: string | null
          id: string | null
          is_promoted: boolean | null
          quality_score: number | null
          relevance_score: number | null
          starts_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promoted_experiences_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      public_event_safety: {
        Row: {
          capacity_ack: boolean | null
          event_id: string | null
          host_accountability_ack: boolean | null
          participant_rules: string | null
          review_status: string | null
          risk_flags: string[] | null
          venue_visibility: string | null
        }
        Insert: {
          capacity_ack?: boolean | null
          event_id?: string | null
          host_accountability_ack?: boolean | null
          participant_rules?: string | null
          review_status?: string | null
          risk_flags?: string[] | null
          venue_visibility?: string | null
        }
        Update: {
          capacity_ack?: boolean | null
          event_id?: string | null
          host_accountability_ack?: boolean | null
          participant_rules?: string | null
          review_status?: string | null
          risk_flags?: string[] | null
          venue_visibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_safety_profiles_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      public_profile_cards: {
        Row: {
          avatar_url: string | null
          bio: string | null
          city: string | null
          display_name: string | null
          interests: string[] | null
          member_since: string | null
          profile_id: string | null
          profile_visibility: string | null
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          city?: never
          display_name?: never
          interests?: never
          member_since?: string | null
          profile_id?: string | null
          profile_visibility?: string | null
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          city?: never
          display_name?: never
          interests?: never
          member_since?: string | null
          profile_id?: string | null
          profile_visibility?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      virtual_hub_discovery_cards: {
        Row: {
          activity_freshness_at: string | null
          city: string | null
          community_rules: string | null
          hobby_activity: string | null
          hobby_category: string | null
          hobby_subcategory: string | null
          host_id: string | null
          id: string | null
          join_policy: string | null
          lifecycle_state: string | null
          member_count: number | null
          purpose: string | null
          welcome_message: string | null
        }
        Insert: {
          activity_freshness_at?: string | null
          city?: string | null
          community_rules?: string | null
          hobby_activity?: string | null
          hobby_category?: string | null
          hobby_subcategory?: string | null
          host_id?: string | null
          id?: string | null
          join_policy?: string | null
          lifecycle_state?: string | null
          member_count?: number | null
          purpose?: string | null
          welcome_message?: string | null
        }
        Update: {
          activity_freshness_at?: string | null
          city?: string | null
          community_rules?: string | null
          hobby_activity?: string | null
          hobby_category?: string | null
          hobby_subcategory?: string | null
          host_id?: string | null
          id?: string | null
          join_policy?: string | null
          lifecycle_state?: string | null
          member_count?: number | null
          purpose?: string | null
          welcome_message?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_circle_suggestion: {
        Args: {
          _creation_key: string
          _name: string
          _purpose: string
          _suggestion_id: string
        }
        Returns: string
      }
      admin_bulk_target_digest: {
        Args: { _target_user_ids: string[] }
        Returns: string
      }
      admin_create_bulk_user_job: {
        Args: {
          _action: string
          _actor_id: string
          _approval_request_id?: string
          _idempotency_key: string
          _reason: string
          _request_id: string
          _target_filter_snapshot: Json
          _target_user_ids: string[]
        }
        Returns: string
      }
      admin_decide_approval: {
        Args: {
          _actor_id: string
          _approval_request_id: string
          _approve: boolean
          _idempotency_key: string
          _reason: string
          _request_id: string
        }
        Returns: string
      }
      admin_finalize_bulk_user_job: { Args: { _job_id: string }; Returns: Json }
      admin_get_bulk_user_job: {
        Args: { _actor_id: string; _job_id: string }
        Returns: Json
      }
      admin_has_capability: {
        Args: { _capability_key: string; _user_id: string }
        Returns: boolean
      }
      admin_list_user_profiles: {
        Args: { _actor_id: string; _limit?: number; _offset?: number }
        Returns: {
          age_band: string
          avatar_url: string
          bio: string
          city: string
          created_at: string
          display_name: string
          district: string
          gender: string
          hobbies: string[]
          id: string
          is_active: boolean
          preferred_radius_km: number
          updated_at: string
          user_id: string
          user_origin: string
        }[]
      }
      admin_mark_bulk_user_job_item: {
        Args: {
          _after_redacted?: Json
          _error_code?: string
          _job_id: string
          _status: string
          _target_user_id: string
        }
        Returns: undefined
      }
      admin_product_outcomes: {
        Args: { _days?: number }
        Returns: {
          event_count: number
          event_name: string
          outcome_day: string
        }[]
      }
      admin_publish_ai_event_proposal: {
        Args: { _actor_id: string; _proposal_id: string }
        Returns: string
      }
      admin_record_audit_event: {
        Args: {
          _action: string
          _actor_id: string
          _after_redacted?: Json
          _approval_request_id?: string
          _before_redacted?: Json
          _capability_key: string
          _error_code?: string
          _idempotency_key: string
          _outcome: string
          _reason: string
          _request_id: string
          _safe_metadata?: Json
          _target_id: string
          _target_type: string
        }
        Returns: string
      }
      admin_request_approval: {
        Args: {
          _action: string
          _actor_id: string
          _capability_key: string
          _idempotency_key: string
          _reason: string
          _request_id: string
          _safe_action_payload: Json
          _target_id: string
          _target_type: string
        }
        Returns: string
      }
      admin_request_external_provider_replay: {
        Args: {
          p_dead_letter_id: string
          p_idempotency_key: string
          p_reason: string
          p_request_id: string
        }
        Returns: string
      }
      admin_set_feature_flag: {
        Args: {
          _cohorts: string[]
          _correlation_id: string
          _eligibility_rule: Json
          _enabled: boolean
          _expires_at: string
          _flag_key: string
          _idempotency_key: string
          _owner: string
          _reason: string
          _rollout_percentage: number
        }
        Returns: string
      }
      admin_set_feature_flag_override: {
        Args: {
          _correlation_id: string
          _enabled: boolean
          _expires_at: string
          _flag_key: string
          _idempotency_key: string
          _reason: string
          _user_id: string
        }
        Returns: string
      }
      admin_set_operator_role: {
        Args: {
          _actor_id: string
          _approval_request_id?: string
          _expires_at: string
          _grant: boolean
          _idempotency_key: string
          _reason: string
          _request_id: string
          _role_key: string
          _target_user_id: string
        }
        Returns: Json
      }
      admin_transition_ai_event_proposal: {
        Args: {
          _actor_id: string
          _human_edits?: Json
          _moderation_status?: string
          _next_status: string
          _organizer_id?: string
          _proposal_id: string
          _reason?: string
          _venue_address?: string
          _venue_lat?: number
          _venue_lon?: number
          _venue_name?: string
          _venue_validation_status?: string
        }
        Returns: Json
      }
      admin_transition_operations_item: {
        Args: {
          _actor_id: string
          _assigned_to: string
          _expected_version: number
          _idempotency_key: string
          _item_id: string
          _next_state: string
          _reason: string
          _request_id: string
        }
        Returns: Json
      }
      admin_update_user_profile: {
        Args: {
          _actor_id: string
          _bio: string
          _event_ids: string[]
          _gender: string
          _hobbies: string[]
          _idempotency_key: string
          _is_active: boolean
          _reason: string
          _request_id: string
          _target_user_id: string
        }
        Returns: Json
      }
      admin_update_virtual_hub_metadata: {
        Args: {
          _actor_id: string
          _city: string
          _community_rules: string
          _hobby_category: string
          _hub_id: string
          _is_discoverable: boolean
          _join_policy: string
          _lifecycle_state: string
          _purpose: string
          _reason: string
          _welcome_message: string
        }
        Returns: {
          activity_freshness_at: string | null
          archive_eligible_at: string | null
          archived_at: string | null
          availability_overlap_count: number
          beginner_friendly: boolean
          city: string | null
          community_rules: string | null
          created_at: string
          generated_member_count: number
          hobby_activity: string | null
          hobby_category: string
          hobby_subcategory: string | null
          host_claimed_at: string | null
          host_id: string | null
          id: string
          identity_key: string
          is_discoverable: boolean
          join_policy: string
          last_reconciled_at: string | null
          lifecycle_state: string
          member_count: number
          organizer_presence_count: number
          purpose: string | null
          qualification_reasons: Json
          qualification_score: number
          reactivation_requested_at: string | null
          real_member_count: number
          recent_real_member_count: number
          unknown_member_count: number
          upcoming_event_count: number
          updated_at: string
          welcome_message: string | null
        }
        SetofOptions: {
          from: "*"
          to: "virtual_hubs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_upsert_entitlement_grant: {
        Args: {
          _correlation_id: string
          _ends_at: string
          _feature_key: string
          _grant_id: string
          _idempotency_key: string
          _limit_value: number
          _plan_key: string
          _reason: string
          _starts_at: string
          _status: string
          _user_id: string
        }
        Returns: string
      }
      admin_upsert_promoted_experience: {
        Args: {
          _actor_id: string
          _ends_at: string
          _event_id: string
          _idempotency_key: string
          _policy_reason: string
          _policy_status: string
          _quality_score: number
          _relevance_score: number
          _request_id: string
          _starts_at: string
        }
        Returns: string
      }
      apply_moderation_action: {
        Args: {
          _action_type: string
          _case_id: string
          _correlation_id: string
          _duration: string
          _evidence_refs: Json
          _feature_key: string
          _idempotency_key: string
          _policy_reason: string
        }
        Returns: string
      }
      assign_virtual_hub_host: {
        Args: {
          _host_id: string
          _hub_id: string
          _idempotency_key: string
          _reason: string
        }
        Returns: Json
      }
      cancel_event_atomic: {
        Args: {
          p_event_id: string
          p_idempotency_key: string
          p_reason: string
        }
        Returns: Json
      }
      cancel_my_data_subject_action: {
        Args: { _request_type: string }
        Returns: undefined
      }
      cancel_own_participation_atomic: {
        Args: { p_event_id: string; p_idempotency_key: string }
        Returns: {
          participation_id: string
          participation_status: string
          replayed: boolean
        }[]
      }
      claim_ai_event_generation_jobs: {
        Args: { _job_id?: string; _lease_seconds?: number; _limit?: number }
        Returns: {
          attempt_count: number
          completed_at: string | null
          created_at: string
          generation_run_id: string | null
          id: string
          idempotency_key: string
          last_error_code: string | null
          lease_expires_at: string | null
          lease_token: string | null
          max_attempts: number
          next_attempt_at: string
          request_metadata: Json
          requested_by: string
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "ai_event_generation_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_due_external_notifications: {
        Args: {
          p_lease_seconds?: number
          p_limit?: number
          p_worker_id: string
        }
        Returns: {
          attempt_count: number
          body: string
          channel: string
          claim_token: string
          data: Json
          expires_at: string
          notification_id: string
          notification_type: string
          title: string
          user_id: string
        }[]
      }
      claim_external_provider_replays: {
        Args: { p_limit?: number }
        Returns: {
          action: string
          dead_letter_id: string
          provider: string
          safe_context: Json
        }[]
      }
      claim_moderation_case: {
        Args: {
          _case_id: string
          _correlation_id: string
          _idempotency_key: string
        }
        Returns: string
      }
      claim_virtual_hub_host: {
        Args: { _hub_id: string; _idempotency_key: string }
        Returns: Json
      }
      complete_ai_event_generation_job: {
        Args: {
          _generation_run_id: string
          _job_id: string
          _lease_token: string
        }
        Returns: boolean
      }
      complete_event_atomic: {
        Args: {
          p_event_id: string
          p_idempotency_key: string
          p_reason: string
        }
        Returns: {
          completed_participants: number
          no_show_participants: number
        }[]
      }
      complete_external_notification_claim: {
        Args: {
          p_claim_token: string
          p_error_code: string
          p_notification_id: string
          p_provider: string
          p_provider_message_id: string
          p_response_code: string
          p_retryable: boolean
          p_safe_metadata?: Json
          p_status: string
        }
        Returns: string
      }
      consume_edge_rate_limit: {
        Args: {
          p_endpoint: string
          p_request_limit: number
          p_subject_hash: string
          p_window_seconds: number
        }
        Returns: {
          allowed: boolean
          remaining: number
          retry_after_seconds: number
        }[]
      }
      create_social_circle: {
        Args: {
          _cadence: string
          _capacity: number
          _creation_key: string
          _membership_policy: string
          _name: string
          _purpose: string
          _safety_rules: string
          _visibility: string
        }
        Returns: string
      }
      defer_external_notifications_for_quiet_hours: {
        Args: { p_limit?: number }
        Returns: number
      }
      enqueue_ai_event_generation_job: {
        Args: {
          _idempotency_key: string
          _request_metadata?: Json
          _requested_by: string
        }
        Returns: {
          attempt_count: number
          completed_at: string | null
          created_at: string
          generation_run_id: string | null
          id: string
          idempotency_key: string
          last_error_code: string | null
          lease_expires_at: string | null
          lease_token: string | null
          max_attempts: number
          next_attempt_at: string
          request_metadata: Json
          requested_by: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "ai_event_generation_jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      enqueue_event_lifecycle_notifications: {
        Args: { p_limit?: number; p_now?: string }
        Returns: Json
      }
      enqueue_hub_opportunity_notifications: {
        Args: { p_limit?: number; p_min_real_members?: number }
        Returns: number
      }
      enqueue_notification: {
        Args: {
          p_actor_user_id?: string
          p_body?: string
          p_channel?: string
          p_correlation_id?: string
          p_data?: Json
          p_dedupe_key?: string
          p_event_key?: string
          p_expires_at?: string
          p_scheduled_at?: string
          p_template_key?: string
          p_template_version?: number
          p_title: string
          p_type: string
          p_user_id: string
        }
        Returns: {
          notification_id: string
          outcome: string
          reason: string
        }[]
      }
      enqueue_social_graph_notifications: {
        Args: { p_limit?: number; p_since?: string }
        Returns: Json
      }
      evaluate_experiment_guardrails: {
        Args: { _correlation_id: string; _experiment_key: string }
        Returns: Json
      }
      evaluate_feature_flag: {
        Args: { _cohort?: string; _flag_key: string; _subject_id: string }
        Returns: boolean
      }
      evaluate_virtual_hub_lifecycle: {
        Args: { _idempotency_key: string; _limit: number }
        Returns: Json
      }
      event_location_precision: {
        Args: { p_event_id: string; p_requester_id?: string }
        Returns: string
      }
      event_safe_payload: {
        Args: { p_event_id: string; p_requester_id?: string }
        Returns: Json
      }
      expire_my_social_graph_records: { Args: never; Returns: Json }
      expire_social_graph_records: {
        Args: { _batch_size?: number }
        Returns: Json
      }
      feature_enabled_for_subject: {
        Args: { _flag_key: string; _subject_id: string }
        Returns: boolean
      }
      generate_event_encounters: {
        Args: { _event_id: string }
        Returns: number
      }
      get_ai_event_proposal_outcomes: {
        Args: { _actor_id: string; _limit?: number }
        Returns: {
          checked_in_count: number
          completed_count: number
          generation_mode: string
          going_count: number
          organizer_accepted: boolean
          proposal_id: string
          proposal_status: string
          published_event_id: string
          report_count: number
        }[]
      }
      get_circle_detail: { Args: { _circle_id: string }; Returns: Json }
      get_circle_health: { Args: { _circle_id: string }; Returns: Json }
      get_circle_venue_search_context: {
        Args: { p_circle_id: string }
        Returns: Json
      }
      get_event_first_confidence_cards: {
        Args: { _event_id: string }
        Returns: {
          accessibility_needs: string
          beginner_friendly: boolean
          communication_preference: string
          display_name: string
          preferred_event_formats: string[]
          preferred_group_size: string
          solo_arrival_comfort: string
          user_id: string
        }[]
      }
      get_event_participant_cards: {
        Args: { _event_id: string }
        Returns: {
          avatar_url: string
          city: string
          display_name: string
          user_id: string
        }[]
      }
      get_external_event_social_summary: {
        Args: { p_external_event_id: string }
        Returns: Json
      }
      get_my_circle_suggestion_cards: {
        Args: never
        Returns: {
          activity_label: string
          city: string
          expires_at: string
          status: string
          suggested_member_count: number
          suggestion_id: string
        }[]
      }
      get_my_connection_cards: {
        Args: never
        Returns: {
          avatar_url: string
          city: string
          connected_at: string
          connection_id: string
          display_name: string
          interests: string[]
          other_user_id: string
        }[]
      }
      get_my_connection_cards_unflagged: {
        Args: never
        Returns: {
          avatar_url: string
          city: string
          connected_at: string
          connection_id: string
          display_name: string
          interests: string[]
          other_user_id: string
        }[]
      }
      get_my_first_event_confidence: { Args: never; Returns: Json }
      get_my_onboarding_preferences: {
        Args: never
        Returns: {
          activity_id: string
          activity_name: string
          experience_level: string
        }[]
      }
      get_my_reconnection_candidates: {
        Args: never
        Returns: {
          avatar_url: string
          city: string
          confidence_status: string
          display_name: string
          encounter_id: string
          event_id: string
          event_title: string
          expires_at: string
          interests: string[]
          other_user_id: string
        }[]
      }
      get_my_reconnection_candidates_unflagged: {
        Args: never
        Returns: {
          avatar_url: string
          city: string
          confidence_status: string
          display_name: string
          encounter_id: string
          event_id: string
          event_title: string
          expires_at: string
          interests: string[]
          other_user_id: string
        }[]
      }
      get_my_virtual_hub_cards: {
        Args: never
        Returns: {
          activity_freshness_at: string
          beginner_friendly: boolean
          can_claim_host: boolean
          city: string
          community_rules: string
          hobby_category: string
          host_avatar_url: string
          host_display_name: string
          host_id: string
          id: string
          join_policy: string
          lifecycle_state: string
          member_count: number
          membership_status: string
          pending_join_count: number
          purpose: string
          qualification_reasons: Json
          qualification_score: number
          welcome_message: string
        }[]
      }
      get_virtual_hub_host_insights: {
        Args: { _hub_id: string }
        Returns: Json
      }
      get_virtual_hub_moderation_queue: {
        Args: { _hub_id: string }
        Returns: {
          created_at: string
          item_type: string
          moderation_item_id: string
          report_category: string
          status: string
          subject_display_name: string
          subject_user_id: string
        }[]
      }
      get_virtual_hub_pending_requests: {
        Args: { _hub_id: string }
        Returns: {
          avatar_url: string
          city: string
          display_name: string
          moderation_item_id: string
          policy_acknowledged: boolean
          requested_at: string
          user_id: string
        }[]
      }
      get_virtual_hub_welcome: { Args: { _hub_id: string }; Returns: Json }
      has_entitlement: {
        Args: {
          _feature_key: string
          _requested_units?: number
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      invite_circle_member: {
        Args: { _circle_id: string; _user_id: string }
        Returns: undefined
      }
      is_blocked_between: {
        Args: { _user_a: string; _user_b: string }
        Returns: boolean
      }
      is_blocked_from_event_organizer: {
        Args: { _event_id: string; _user_id: string }
        Returns: boolean
      }
      is_circle_member: { Args: { _circle_id: string }; Returns: boolean }
      is_event_operator: {
        Args: { p_capability?: string; p_event_id: string }
        Returns: boolean
      }
      is_event_owner: {
        Args: { _event_id: string; _user_id: string }
        Returns: boolean
      }
      is_event_participant: {
        Args: { _event_id: string; _user_id: string }
        Returns: boolean
      }
      is_resource_removed: {
        Args: { _target_ref: string; _target_type: string }
        Returns: boolean
      }
      is_safety_reviewer: { Args: { _user_id: string }; Returns: boolean }
      is_user_feature_restricted: {
        Args: { _feature_key: string; _user_id: string }
        Returns: boolean
      }
      is_user_organizer_restricted: {
        Args: { _user_id: string }
        Returns: boolean
      }
      is_user_suspended: { Args: { _user_id: string }; Returns: boolean }
      join_event_atomic: {
        Args: { p_event_id: string; p_idempotency_key: string }
        Returns: {
          participation_id: string
          participation_status: string
          replayed: boolean
        }[]
      }
      leave_social_circle: {
        Args: { _circle_id: string; _reason?: string }
        Returns: string
      }
      link_event_to_my_circle: {
        Args: {
          p_circle_id: string
          p_event_id: string
          p_idempotency_key: string
        }
        Returns: {
          event_id: string
          replayed: boolean
        }[]
      }
      list_discoverable_events_safe: {
        Args: { p_from_date: string; p_limit?: number; p_requester_id?: string }
        Returns: Json[]
      }
      list_discoverable_events_safe_page: {
        Args: {
          p_from_date?: string
          p_limit?: number
          p_offset?: number
          p_requester_id?: string
        }
        Returns: Json
      }
      list_external_events_safe_page: {
        Args: { p_from_date?: string; p_limit?: number; p_offset?: number }
        Returns: Json
      }
      list_my_organizer_event_ids: { Args: never; Returns: string[] }
      manage_event_crew_role_atomic: {
        Args: {
          p_action: string
          p_can_check_in?: boolean
          p_can_edit_event?: boolean
          p_can_message_attendees?: boolean
          p_can_moderate?: boolean
          p_can_view_finance?: boolean
          p_event_id: string
          p_idempotency_key?: string
          p_reason?: string
          p_user_id: string
        }
        Returns: Json
      }
      manage_event_series_atomic: {
        Args: {
          p_action: string
          p_idempotency_key: string
          p_reason: string
          p_recurrence_rule: string
          p_series_id: string
          p_timezone: string
          p_title: string
        }
        Returns: string
      }
      manage_event_series_occurrence_atomic: {
        Args: {
          p_event_id: string
          p_idempotency_key: string
          p_occurrence_id: string
          p_occurrence_start: string
          p_occurrence_state: string
          p_original_start: string
          p_reason: string
          p_series_id: string
        }
        Returns: string
      }
      mark_other_session_devices_revoked: {
        Args: { _current_fingerprint: string }
        Returns: number
      }
      materialize_due_notification_digests: {
        Args: { p_limit?: number }
        Returns: Json
      }
      organizer_accept_ai_event_proposal: {
        Args: { _accepted: boolean; _proposal_id: string; _reason?: string }
        Returns: Json
      }
      organizer_can_view_profile: {
        Args: { _organizer_id: string; _profile_user_id: string }
        Returns: boolean
      }
      organizer_send_event_message_atomic: {
        Args: {
          p_audience_filter: string
          p_body: string
          p_event_id: string
          p_idempotency_key: string
          p_message_type: string
          p_request_id: string
          p_scheduled_for: string
          p_selected_participation_ids: string[]
          p_subject: string
        }
        Returns: Json
      }
      organizer_transition_participant_atomic: {
        Args: {
          p_idempotency_key: string
          p_next_status: string
          p_participation_id: string
          p_reason: string
        }
        Returns: {
          participation_id: string
          participation_status: string
          replayed: boolean
        }[]
      }
      prepare_my_data_export: { Args: { _request_id: string }; Returns: Json }
      public_event_participant_counts: {
        Args: { p_event_ids: string[] }
        Returns: {
          cancelled: number
          checked_in: number
          completed: number
          event_id: string
          going: number
          total: number
          waitlist: number
        }[]
      }
      publish_event_with_readiness_atomic: {
        Args: {
          p_event_id: string
          p_idempotency_key: string
          p_reason: string
        }
        Returns: Json
      }
      purge_expired_product_analytics: {
        Args: { _batch_limit: number; _correlation_id: string }
        Returns: number
      }
      queue_external_event_dedupe_reviews: { Args: never; Returns: number }
      rank_activity_context_events: {
        Args: { p_candidate_ids: string[]; p_limit?: number }
        Returns: {
          attended_similar: boolean
          availability_match: boolean
          distance_km: number
          event_id: string
          exposure_share: number
          host_reliability: number
          impression_count: number
          ranking_score: number
          reason_codes: string[]
        }[]
      }
      reconcile_virtual_hub_member: {
        Args: { _idempotency_key: string; _target_user_id: string }
        Returns: Json
      }
      reconcile_virtual_hubs_batch: {
        Args: { _idempotency_key: string; _limit: number }
        Returns: Json
      }
      record_experiment_metric_snapshot: {
        Args: {
          _correlation_id: string
          _experiment_key: string
          _metric_key: string
          _metric_value: number
          _sample_size: number
          _window_ended_at: string
          _window_started_at: string
        }
        Returns: string
      }
      record_external_provider_cost: {
        Args: { p_cost_units: number; p_provider: string; p_run_id: string }
        Returns: undefined
      }
      record_external_provider_dead_letter: {
        Args: {
          p_action: string
          p_error_code: string
          p_error_kind: string
          p_payload_digest?: string
          p_provider: string
          p_run_id: string
          p_safe_context?: Json
        }
        Returns: string
      }
      record_my_consent: {
        Args: {
          _decision: string
          _idempotency_key: string
          _policy_version: string
          _purpose: string
          _source_surface: string
        }
        Returns: string
      }
      record_notification_delivery_attempt: {
        Args: {
          p_error_code?: string
          p_notification_id: string
          p_provider?: string
          p_provider_message_id?: string
          p_response_code?: string
          p_retryable?: boolean
          p_safe_metadata?: Json
          p_status: string
        }
        Returns: string
      }
      record_virtual_hub_activation: {
        Args: { _dedupe_key: string; _hub_id: string; _stage: string }
        Returns: undefined
      }
      redact_expired_safety_evidence: {
        Args: { _batch_limit: number; _correlation_id: string }
        Returns: number
      }
      refresh_external_supply_freshness: {
        Args: never
        Returns: {
          event_rows: number
          place_rows: number
        }[]
      }
      refresh_my_circle_suggestions: { Args: never; Returns: Json }
      refresh_operations_inbox: { Args: { _limit?: number }; Returns: Json }
      refresh_virtual_hub_qualification: {
        Args: { _hub_id: string }
        Returns: undefined
      }
      refresh_virtual_hubs: { Args: never; Returns: undefined }
      register_my_session_device: {
        Args: {
          _device_label: string
          _session_fingerprint: string
          _user_agent_family?: string
        }
        Returns: string
      }
      release_due_in_app_notifications: {
        Args: { p_limit?: number }
        Returns: number
      }
      release_due_organizer_messages: {
        Args: { p_limit?: number }
        Returns: number
      }
      request_circle_membership: {
        Args: { _acknowledge_rules: boolean; _circle_id: string }
        Returns: string
      }
      request_my_data_subject_action: {
        Args: { _request_type: string }
        Returns: string
      }
      request_my_data_subject_action_v2: {
        Args: {
          _export_scope: string[]
          _idempotency_key: string
          _request_type: string
        }
        Returns: Json
      }
      request_virtual_hub_join: {
        Args: {
          _acknowledge_rules: boolean
          _hub_id: string
          _idempotency_key: string
        }
        Returns: string
      }
      request_virtual_hub_reactivation: {
        Args: { _hub_id: string; _idempotency_key: string; _reason: string }
        Returns: string
      }
      require_feature_enabled: {
        Args: { _flag_key: string; _subject_id?: string }
        Returns: undefined
      }
      reschedule_event_atomic: {
        Args: {
          p_end_at: string
          p_event_id: string
          p_idempotency_key: string
          p_reason: string
          p_start_at: string
        }
        Returns: Json
      }
      resolve_circle_membership_request: {
        Args: {
          _approve: boolean
          _circle_id: string
          _reason?: string
          _user_id: string
        }
        Returns: string
      }
      resolve_external_provider_dead_letter: {
        Args: {
          p_dead_letter_id: string
          p_error_code?: string
          p_succeeded: boolean
        }
        Returns: undefined
      }
      resolve_moderation_appeal: {
        Args: {
          _appeal_id: string
          _correlation_id: string
          _idempotency_key: string
          _resolution: string
          _resolution_note: string
        }
        Returns: string
      }
      resolve_virtual_hub_join_request: {
        Args: {
          _approve: boolean
          _idempotency_key: string
          _moderation_item_id: string
          _reason: string
        }
        Returns: Json
      }
      resolve_virtual_hub_moderation_item: {
        Args: {
          _action: string
          _idempotency_key: string
          _moderation_item_id: string
          _reason: string
        }
        Returns: Json
      }
      respond_to_circle_membership: {
        Args: {
          _accept: boolean
          _acknowledge_rules?: boolean
          _circle_id: string
        }
        Returns: undefined
      }
      retry_ai_event_generation_job: {
        Args: {
          _error_code: string
          _job_id: string
          _lease_token: string
          _retryable?: boolean
        }
        Returns: string
      }
      reviewer_can_view_reported_profile: {
        Args: { _profile_user_id: string; _reviewer_id: string }
        Returns: boolean
      }
      revoke_connection: {
        Args: { _connection_id: string }
        Returns: undefined
      }
      run_privacy_retention_maintenance: {
        Args: { _batch_limit: number; _correlation_id: string }
        Returns: Json
      }
      save_my_first_event_confidence: {
        Args: { _clear?: boolean; _payload: Json }
        Returns: Json
      }
      save_my_onboarding_progress: {
        Args: { _complete?: boolean; _payload: Json; _step: number }
        Returns: Json
      }
      save_organizer_note_atomic: {
        Args: {
          p_idempotency_key: string
          p_note: string
          p_participation_id: string
        }
        Returns: undefined
      }
      save_organizer_readiness_assessment_atomic: {
        Args: {
          p_checklist: Json
          p_event_id: string
          p_idempotency_key: string
        }
        Returns: Json
      }
      set_arrival_confidence_atomic: {
        Args: {
          p_arrival_visibility: string
          p_arriving_alone: boolean
          p_event_id: string
          p_first_hobbeast_event: boolean
          p_idempotency_key: string
        }
        Returns: {
          arrival_visibility: string
          arriving_alone: boolean
          first_hobbeast_event: boolean
          participation_id: string
          replayed: boolean
        }[]
      }
      set_discovery_preference: {
        Args: {
          p_candidate_source: string
          p_canonical_identity: string
          p_idempotency_key: string
          p_preference: string
        }
        Returns: {
          canonical_identity: string
          preference: string
          replayed: boolean
        }[]
      }
      set_external_event_social_intent: {
        Args: {
          p_active: boolean
          p_external_event_id: string
          p_idempotency_key: string
          p_intent: string
        }
        Returns: {
          intent: string
          replayed: boolean
          status: string
        }[]
      }
      set_reconnection_preference: {
        Args: { _decision: string; _encounter_id: string }
        Returns: string
      }
      set_user_block: {
        Args: {
          _blocked: boolean
          _blocked_user_id: string
          _reason_code?: string
        }
        Returns: undefined
      }
      submit_moderation_appeal: {
        Args: {
          _correlation_id: string
          _moderation_action_id: string
          _statement: string
        }
        Returns: string
      }
      submit_safety_report: {
        Args: {
          _details: string
          _idempotency_key: string
          _reason_code: string
          _reported_user_id: string
          _source_surface: string
          _target_ref: string
          _target_type: string
        }
        Returns: string
      }
      submit_user_report: {
        Args: {
          _category: string
          _context_id: string
          _context_type: string
          _details?: string
          _reported_user_id: string
        }
        Returns: string
      }
      suppress_external_notification_claim: {
        Args: {
          p_claim_token: string
          p_notification_id: string
          p_reason: string
        }
        Returns: boolean
      }
      transition_moderation_case: {
        Args: {
          _assignee_id: string
          _case_id: string
          _correlation_id: string
          _idempotency_key: string
          _next_status: string
          _note: string
        }
        Returns: string
      }
      transition_social_circle: {
        Args: { _circle_id: string; _next_state: string; _reason?: string }
        Returns: undefined
      }
      upsert_operations_inbox_item: {
        Args: {
          _dedupe_key: string
          _related_entities?: Json
          _safe_deep_link?: string
          _safe_summary: string
          _severity: string
          _sla_target_at: string
          _source_domain: string
          _source_ref: string
          _title: string
        }
        Returns: string
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

