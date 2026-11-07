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
    PostgrestVersion: "14.18"
  }
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
      admin_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          detail: Json
          id: string
          target: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          detail?: Json
          id?: string
          target?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          detail?: Json
          id?: string
          target?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_eligible_students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_files: {
        Row: {
          assignment_id: string
          created_at: string
          file_name: string
          file_size_bytes: number
          file_url: string
          id: string
        }
        Insert: {
          assignment_id: string
          created_at?: string
          file_name: string
          file_size_bytes?: number
          file_url: string
          id?: string
        }
        Update: {
          assignment_id?: string
          created_at?: string
          file_name?: string
          file_size_bytes?: number
          file_url?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_files_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_submission_files: {
        Row: {
          created_at: string
          file_name: string
          file_size_bytes: number
          file_url: string
          id: string
          submission_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_size_bytes?: number
          file_url: string
          id?: string
          submission_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_size_bytes?: number
          file_url?: string
          id?: string
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_submission_files_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "assignment_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_submissions: {
        Row: {
          assignment_id: string
          created_at: string
          feedback: string | null
          feedback_given_at: string | null
          grade: number | null
          graded_at: string | null
          graded_by: string | null
          id: string
          outcome: string | null
          status: string
          submitted_at: string | null
          text_content: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          assignment_id: string
          created_at?: string
          feedback?: string | null
          feedback_given_at?: string | null
          grade?: number | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          outcome?: string | null
          status?: string
          submitted_at?: string | null
          text_content?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          assignment_id?: string
          created_at?: string
          feedback?: string | null
          feedback_given_at?: string | null
          grade?: number | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          outcome?: string | null
          status?: string
          submitted_at?: string | null
          text_content?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_submissions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_submissions_graded_by_fkey"
            columns: ["graded_by"]
            isOneToOne: false
            referencedRelation: "leaderboard_eligible_students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_submissions_graded_by_fkey"
            columns: ["graded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_eligible_students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      assignments: {
        Row: {
          course_id: string
          created_at: string
          description: string | null
          end_at: string
          id: string
          order_index: number
          pass_grade: number
          start_at: string
          title: string
          total_grade: number
          unit_id: string
          updated_at: string
        }
        Insert: {
          course_id: string
          created_at?: string
          description?: string | null
          end_at: string
          id?: string
          order_index?: number
          pass_grade: number
          start_at: string
          title: string
          total_grade: number
          unit_id: string
          updated_at?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          description?: string | null
          end_at?: string
          id?: string
          order_index?: number
          pass_grade?: number
          start_at?: string
          title?: string
          total_grade?: number
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      badge_conditions: {
        Row: {
          badge_id: string
          condition_type: string
          created_at: string
          id: string
          target_int: number | null
          target_uuid: string | null
        }
        Insert: {
          badge_id: string
          condition_type: string
          created_at?: string
          id?: string
          target_int?: number | null
          target_uuid?: string | null
        }
        Update: {
          badge_id?: string
          condition_type?: string
          created_at?: string
          id?: string
          target_int?: number | null
          target_uuid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "badge_conditions_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
        ]
      }
      badges: {
        Row: {
          created_at: string
          description: string | null
          icon_url: string
          id: string
          is_active: boolean
          name: string
          points_reward: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          icon_url: string
          id?: string
          is_active?: boolean
          name: string
          points_reward?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          icon_url?: string
          id?: string
          is_active?: boolean
          name?: string
          points_reward?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "badges_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "leaderboard_eligible_students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "badges_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      book_cart_items: {
        Row: {
          added_at: string
          book_id: string
          id: string
          quantity: number
          user_id: string
        }
        Insert: {
          added_at?: string
          book_id: string
          id?: string
          quantity?: number
          user_id: string
        }
        Update: {
          added_at?: string
          book_id?: string
          id?: string
          quantity?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_cart_items_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_cart_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_eligible_students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_cart_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      book_images: {
        Row: {
          book_id: string
          created_at: string
          id: string
          image_url: string
          order_index: number
        }
        Insert: {
          book_id: string
          created_at?: string
          id?: string
          image_url: string
          order_index?: number
        }
        Update: {
          book_id?: string
          created_at?: string
          id?: string
          image_url?: string
          order_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "book_images_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      book_order_items: {
        Row: {
          book_id: string
          book_type: string
          created_at: string
          digital_downloads_used: number
          id: string
          order_id: string
          quantity: number
          unit_price_piastres: number
        }
        Insert: {
          book_id: string
          book_type: string
          created_at?: string
          digital_downloads_used?: number
          id?: string
          order_id: string
          quantity: number
          unit_price_piastres: number
        }
        Update: {
          book_id?: string
          book_type?: string
          created_at?: string
          digital_downloads_used?: number
          id?: string
          order_id?: string
          quantity?: number
          unit_price_piastres?: number
        }
        Relationships: [
          {
            foreignKeyName: "book_order_items_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "book_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      book_order_refund_requests: {
        Row: {
          gateway_refund_reference: string | null
          id: string
          order_id: string
          processed_at: string | null
          processing_error: string | null
          reason: string
          refund_method: string | null
          requested_at: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          gateway_refund_reference?: string | null
          id?: string
          order_id: string
          processed_at?: string | null
          processing_error?: string | null
          reason: string
          refund_method?: string | null
          requested_at?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          gateway_refund_reference?: string | null
          id?: string
          order_id?: string
          processed_at?: string | null
          processing_error?: string | null
          reason?: string
          refund_method?: string | null
          requested_at?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_order_refund_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "book_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_order_refund_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "leaderboard_eligible_students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_order_refund_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_order_refund_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_eligible_students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_order_refund_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      book_order_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          from_status: string | null
          id: string
          notes: string | null
          notify_student: boolean
          order_id: string
          to_status: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          notes?: string | null
          notify_student?: boolean
          order_id: string
          to_status: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          notes?: string | null
          notify_student?: boolean
          order_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_order_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "leaderboard_eligible_students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_order_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "book_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      book_orders: {
        Row: {
          cancelled_at: string | null
          confirmed_at: string | null
          created_at: string
          delivered_at: string | null
          delivery_failed_at: string | null
          has_physical_items: boolean
          id: string
          items_subtotal_piastres: number
          order_number: string
          payment_gateway_id: string
          shipped_at: string | null
          shipping_address: Json | null
          shipping_cost_piastres: number
          shipping_zone_id: string | null
          status: string
          total_piastres: number
          updated_at: string
          user_id: string
        }
        Insert: {
          cancelled_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          delivered_at?: string | null
          delivery_failed_at?: string | null
          has_physical_items: boolean
          id?: string
          items_subtotal_piastres: number
          order_number: string
          payment_gateway_id: string
          shipped_at?: string | null
          shipping_address?: Json | null
          shipping_cost_piastres?: number
          shipping_zone_id?: string | null
          status?: string
          total_piastres: number
          updated_at?: string
          user_id: string
        }
        Update: {
          cancelled_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          delivered_at?: string | null
          delivery_failed_at?: string | null
          has_physical_items?: boolean
          id?: string
          items_subtotal_piastres?: number
          order_number?: string
          payment_gateway_id?: string
          shipped_at?: string | null
          shipping_address?: Json | null
          shipping_cost_piastres?: number
          shipping_zone_id?: string | null
          status?: string
          total_piastres?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_orders_payment_gateway_id_fkey"
            columns: ["payment_gateway_id"]
            isOneToOne: false
            referencedRelation: "payment_gateways"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_orders_shipping_zone_id_fkey"
            columns: ["shipping_zone_id"]
            isOneToOne: false
            referencedRelation: "shipping_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_eligible_students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      books: {
        Row: {
          author: string | null
          book_type: string
          cover_image_url: string | null
          created_at: string
          created_by: string | null
          description: string | null
          digital_file_url: string | null
          discount_expires_at: string | null
          discount_price_piastres: number | null
          download_limit: number | null
          height_cm: number | null
          id: string
          is_drm_protected: boolean
          isbn: string | null
          language: string
          length_cm: number | null
          price_piastres: number
          publication_year: number | null
          publisher: string | null
          stage_id: string | null
          stage_ids: string[] | null
          status: string
          stock_quantity: number | null
          subject_id: string | null
          subject_ids: string[] | null
          tags: string[] | null
          title: string
          updated_at: string
          weight_grams: number | null
          width_cm: number | null
        }
        Insert: {
          author?: string | null
          book_type: string
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          digital_file_url?: string | null
          discount_expires_at?: string | null
          discount_price_piastres?: number | null
          download_limit?: number | null
          height_cm?: number | null
          id?: string
          is_drm_protected?: boolean
          isbn?: string | null
          language?: string
          length_cm?: number | null
          price_piastres: number
          publication_year?: number | null
          publisher?: string | null
          stage_id?: string | null
          stage_ids?: string[] | null
          status?: string
          stock_quantity?: number | null
          subject_id?: string | null
          subject_ids?: string[] | null
          tags?: string[] | null
          title: string
          updated_at?: string
          weight_grams?: number | null
          width_cm?: number | null
        }
        Update: {
          author?: string | null
          book_type?: string
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          digital_file_url?: string | null
          discount_expires_at?: string | null
          discount_price_piastres?: number | null
          download_limit?: number | null
          height_cm?: number | null
          id?: string
          is_drm_protected?: boolean
          isbn?: string | null
          language?: string
          length_cm?: number | null
          price_piastres?: number
          publication_year?: number | null
          publisher?: string | null
          stage_id?: string | null
          stage_ids?: string[] | null
          status?: string
          stock_quantity?: number | null
          subject_id?: string | null
          subject_ids?: string[] | null
          tags?: string[] | null
          title?: string
          updated_at?: string
          weight_grams?: number | null
          width_cm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "books_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "books_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address_details: string
          branch_name: string
          created_at: string
          governorate: string
          id: string
          is_active: boolean
          order_index: number
          updated_at: string
        }
        Insert: {
          address_details: string
          branch_name: string
          created_at?: string
          governorate: string
          id?: string
          is_active?: boolean
          order_index?: number
          updated_at?: string
        }
        Update: {
          address_details?: string
          branch_name?: string
          created_at?: string
          governorate?: string
          id?: string
          is_active?: boolean
          order_index?: number
          updated_at?: string
        }
        Relationships: []
      }
      bundle_courses: {
        Row: {
          bundle_id: string
          course_id: string
          created_at: string
          position: number
        }
        Insert: {
          bundle_id: string
          course_id: string
          created_at?: string
          position?: number
        }
        Update: {
          bundle_id?: string
          course_id?: string
          created_at?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "bundle_courses_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundle_courses_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      bundle_purchases: {
        Row: {
          amount_piastres: number
          bundle_id: string
          courses_included: number
          created_at: string
          discount_amount_piastres: number
          id: string
          original_price_piastres: number | null
          payment_transaction_id: string | null
          user_id: string
        }
        Insert: {
          amount_piastres: number
          bundle_id: string
          courses_included: number
          created_at?: string
          discount_amount_piastres?: number
          id?: string
          original_price_piastres?: number | null
          payment_transaction_id?: string | null
          user_id: string
        }
        Update: {
          amount_piastres?: number
          bundle_id?: string
          courses_included?: number
          created_at?: string
          discount_amount_piastres?: number
          id?: string
          original_price_piastres?: number | null
          payment_transaction_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bundle_purchases_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundle_purchases_payment_transaction_id_fkey"
            columns: ["payment_transaction_id"]
            isOneToOne: false
            referencedRelation: "payment_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundle_purchases_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_eligible_students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundle_purchases_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bundles: {
        Row: {
          cover_image_url: string | null
          created_at: string
          created_by: string | null
          description: string | null
          discount_expires_at: string | null
          discount_price_piastres: number | null
          featured_at: string | null
          id: string
          is_featured: boolean
          is_paid: boolean
          price_piastres: number | null
          slug: string | null
          stage_id: string | null
          status: string
          subject_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          discount_expires_at?: string | null
          discount_price_piastres?: number | null
          featured_at?: string | null
          id?: string
          is_featured?: boolean
          is_paid?: boolean
          price_piastres?: number | null
          slug?: string | null
          stage_id?: string | null
          status?: string
          subject_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          discount_expires_at?: string | null
          discount_price_piastres?: number | null
          featured_at?: string | null
          id?: string
          is_featured?: boolean
          is_paid?: boolean
          price_piastres?: number | null
          slug?: string | null
          stage_id?: string | null
          status?: string
          subject_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bundles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "leaderboard_eligible_students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundles_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundles_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      card_templates: {
        Row: {
          back_design: Json
          created_at: string
          front_design: Json
          id: string
          is_default: boolean
          name: string
          updated_at: string
        }
        Insert: {
          back_design?: Json
          created_at?: string
          front_design?: Json
          id?: string
          is_default?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          back_design?: Json
          created_at?: string
          front_design?: Json
          id?: string
          is_default?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      courses: {
        Row: {
          content_drip_enabled: boolean
          course_type: string
          created_at: string
          created_by: string | null
          description: string | null
          discount_expires_at: string | null
          discount_price_piastres: number | null
          enrollment_mode: string
          featured_at: string | null
          id: string
          is_featured: boolean
          is_paid: boolean
          price_piastres: number | null
          scheduled_publish_at: string | null
          scheduled_publish_job_id: string | null
          stage_id: string | null
          stage_ids: string[] | null
          status: string
          subject_id: string | null
          subject_ids: string[] | null
          thumbnail_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          content_drip_enabled?: boolean
          course_type?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          discount_expires_at?: string | null
          discount_price_piastres?: number | null
          enrollment_mode?: string
          featured_at?: string | null
          id?: string
          is_featured?: boolean
          is_paid?: boolean
          price_piastres?: number | null
          scheduled_publish_at?: string | null
          scheduled_publish_job_id?: string | null
          stage_id?: string | null
          stage_ids?: string[] | null
          status?: string
          subject_id?: string | null
          subject_ids?: string[] | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          content_drip_enabled?: boolean
          course_type?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          discount_expires_at?: string | null
          discount_price_piastres?: number | null
          enrollment_mode?: string
          featured_at?: string | null
          id?: string
          is_featured?: boolean
          is_paid?: boolean
          price_piastres?: number | null
          scheduled_publish_at?: string | null
          scheduled_publish_job_id?: string | null
          stage_id?: string | null
          stage_ids?: string[] | null
          status?: string
          subject_id?: string | null
          subject_ids?: string[] | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "leaderboard_eligible_students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollments: {
        Row: {
          course_id: string
          enrolled_at: string
          id: string
          user_id: string
        }
        Insert: {
          course_id: string
          enrolled_at?: string
          id?: string
          user_id: string
        }
        Update: {
          course_id?: string
          enrolled_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_eligible_students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_file_downloads: {
        Row: {
          created_at: string
          download_count: number
          id: string
          lesson_file_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          download_count?: number
          id?: string
          lesson_file_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          download_count?: number
          id?: string
          lesson_file_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_file_downloads_lesson_file_id_fkey"
            columns: ["lesson_file_id"]
            isOneToOne: false
            referencedRelation: "lesson_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_file_downloads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_eligible_students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_file_downloads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_files: {
        Row: {
          allow_download: boolean
          created_at: string
          download_limit: number | null
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          lesson_id: string
        }
        Insert: {
          allow_download?: boolean
          created_at?: string
          download_limit?: number | null
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          lesson_id: string
        }
        Update: {
          allow_download?: boolean
          created_at?: string
          download_limit?: number | null
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          lesson_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_files_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_progress: {
        Row: {
          completed_at: string
          course_id: string
          id: string
          lesson_id: string
          user_id: string
        }
        Insert: {
          completed_at?: string
          course_id: string
          id?: string
          lesson_id: string
          user_id: string
        }
        Update: {
          completed_at?: string
          course_id?: string
          id?: string
          lesson_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_progress_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_eligible_students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_watch_progress: {
        Row: {
          course_id: string
          created_at: string
          duration_seconds: number
          furthest_position_seconds: number
          id: string
          last_position_seconds: number
          lesson_id: string
          updated_at: string
          user_id: string
          watch_percentage: number
          watched_seconds: number
        }
        Insert: {
          course_id: string
          created_at?: string
          duration_seconds?: number
          furthest_position_seconds?: number
          id?: string
          last_position_seconds?: number
          lesson_id: string
          updated_at?: string
          user_id: string
          watch_percentage?: number
          watched_seconds?: number
        }
        Update: {
          course_id?: string
          created_at?: string
          duration_seconds?: number
          furthest_position_seconds?: number
          id?: string
          last_position_seconds?: number
          lesson_id?: string
          updated_at?: string
          user_id?: string
          watch_percentage?: number
          watched_seconds?: number
        }
        Relationships: [
          {
            foreignKeyName: "lesson_watch_progress_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_watch_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_watch_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_eligible_students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_watch_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons: {
        Row: {
          created_at: string
          description: string | null
          id: string
          position: number
          title: string
          unit_id: string
          unlock_quiz_id: string | null
          updated_at: string
          video_provider: Database["public"]["Enums"]["video_provider"] | null
          video_url: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          position?: number
          title: string
          unit_id: string
          unlock_quiz_id?: string | null
          updated_at?: string
          video_provider?: Database["public"]["Enums"]["video_provider"] | null
          video_url?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          position?: number
          title?: string
          unit_id?: string
          unlock_quiz_id?: string | null
          updated_at?: string
          video_provider?: Database["public"]["Enums"]["video_provider"] | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lessons_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_unlock_quiz_id_fkey"
            columns: ["unlock_quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      levels: {
        Row: {
          created_at: string
          icon_url: string | null
          id: string
          min_points: number
          name: string
          order_index: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          icon_url?: string | null
          id?: string
          min_points: number
          name: string
          order_index?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          icon_url?: string | null
          id?: string
          min_points?: number
          name?: string
          order_index?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "levels_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "leaderboard_eligible_students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "levels_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      live_recordings: {
        Row: {
          attempts: number
          bytes_done: number
          created_at: string
          download_token: string | null
          download_url: string | null
          file_size: number | null
          id: string
          last_error: string | null
          lesson_id: string | null
          locked_until: string | null
          part_index: number | null
          part_size: number
          parts: Json
          r2_key: string | null
          recording_end: string | null
          recording_start: string | null
          recording_type: string | null
          segment_id: string | null
          session_id: string
          source: string
          status: string
          updated_at: string
          upload_id: string | null
          zoom_file_id: string | null
        }
        Insert: {
          attempts?: number
          bytes_done?: number
          created_at?: string
          download_token?: string | null
          download_url?: string | null
          file_size?: number | null
          id?: string
          last_error?: string | null
          lesson_id?: string | null
          locked_until?: string | null
          part_index?: number | null
          part_size?: number
          parts?: Json
          r2_key?: string | null
          recording_end?: string | null
          recording_start?: string | null
          recording_type?: string | null
          segment_id?: string | null
          session_id: string
          source: string
          status?: string
          updated_at?: string
          upload_id?: string | null
          zoom_file_id?: string | null
        }
        Update: {
          attempts?: number
          bytes_done?: number
          created_at?: string
          download_token?: string | null
          download_url?: string | null
          file_size?: number | null
          id?: string
          last_error?: string | null
          lesson_id?: string | null
          locked_until?: string | null
          part_index?: number | null
          part_size?: number
          parts?: Json
          r2_key?: string | null
          recording_end?: string | null
          recording_start?: string | null
          recording_type?: string | null
          segment_id?: string | null
          session_id?: string
          source?: string
          status?: string
          updated_at?: string
          upload_id?: string | null
          zoom_file_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "live_recordings_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_recordings_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "live_session_segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_recordings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_session_attendance: {
        Row: {
          first_joined_at: string
          join_count: number
          last_joined_at: string
          segment_id: string
          session_id: string
          user_id: string
        }
        Insert: {
          first_joined_at?: string
          join_count?: number
          last_joined_at?: string
          segment_id: string
          session_id: string
          user_id: string
        }
        Update: {
          first_joined_at?: string
          join_count?: number
          last_joined_at?: string
          segment_id?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_session_attendance_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "live_session_segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_session_attendance_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_session_attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_eligible_students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_session_attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      live_session_files: {
        Row: {
          allow_download: boolean
          created_at: string
          file_name: string
          file_size: number | null
          file_type: string | null
          id: string
          position: number
          session_id: string
          storage_path: string
        }
        Insert: {
          allow_download?: boolean
          created_at?: string
          file_name: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          position?: number
          session_id: string
          storage_path: string
        }
        Update: {
          allow_download?: boolean
          created_at?: string
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          position?: number
          session_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_session_files_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_session_notification_log: {
        Row: {
          kind: string
          sent_at: string
          session_id: string
        }
        Insert: {
          kind: string
          sent_at?: string
          session_id: string
        }
        Update: {
          kind?: string
          sent_at?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_session_notification_log_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_session_secrets: {
        Row: {
          segment_id: string
          start_url: string | null
          start_url_fetched_at: string | null
        }
        Insert: {
          segment_id: string
          start_url?: string | null
          start_url_fetched_at?: string | null
        }
        Update: {
          segment_id?: string
          start_url?: string | null
          start_url_fetched_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "live_session_secrets_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: true
            referencedRelation: "live_session_segments"
            referencedColumns: ["id"]
          },
        ]
      }
      live_session_segments: {
        Row: {
          created_at: string
          created_by: string | null
          ended_at: string | null
          id: string
          join_url: string
          password: string | null
          replace_reason: string | null
          segment_index: number
          session_id: string
          source: string
          started_at: string | null
          zoom_meeting_id: number | null
          zoom_meeting_uuid: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          ended_at?: string | null
          id?: string
          join_url: string
          password?: string | null
          replace_reason?: string | null
          segment_index: number
          session_id: string
          source: string
          started_at?: string | null
          zoom_meeting_id?: number | null
          zoom_meeting_uuid?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          ended_at?: string | null
          id?: string
          join_url?: string
          password?: string | null
          replace_reason?: string | null
          segment_index?: number
          session_id?: string
          source?: string
          started_at?: string | null
          zoom_meeting_id?: number | null
          zoom_meeting_uuid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "live_session_segments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "leaderboard_eligible_students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_session_segments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_session_segments_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_sessions: {
        Row: {
          cancelled_at: string | null
          course_id: string
          created_at: string
          created_by: string | null
          current_segment_id: string | null
          description: string | null
          duration_minutes: number
          ended_at: string | null
          host_user_id: string
          id: string
          link_version: number
          no_recording_reason: string | null
          position: number
          recording_enabled: boolean
          scheduled_start_at: string
          started_at: string | null
          status: string
          title: string
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          course_id: string
          created_at?: string
          created_by?: string | null
          current_segment_id?: string | null
          description?: string | null
          duration_minutes: number
          ended_at?: string | null
          host_user_id: string
          id?: string
          link_version?: number
          no_recording_reason?: string | null
          position?: number
          recording_enabled?: boolean
          scheduled_start_at: string
          started_at?: string | null
          status?: string
          title: string
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          course_id?: string
          created_at?: string
          created_by?: string | null
          current_segment_id?: string | null
          description?: string | null
          duration_minutes?: number
          ended_at?: string | null
          host_user_id?: string
          id?: string
          link_version?: number
          no_recording_reason?: string | null
          position?: number
          recording_enabled?: boolean
          scheduled_start_at?: string
          started_at?: string | null
          status?: string
          title?: string
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_sessions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "leaderboard_eligible_students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_sessions_current_segment_fk"
            columns: ["current_segment_id"]
            isOneToOne: false
            referencedRelation: "live_session_segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_sessions_host_user_id_fkey"
            columns: ["host_user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_eligible_students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_sessions_host_user_id_fkey"
            columns: ["host_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_sessions_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      manual_payment_methods: {
        Row: {
          account_holder_name: string
          account_number: string
          created_at: string
          id: string
          is_enabled: boolean
          method_type: string
          support_whatsapp_number: string
          updated_at: string
        }
        Insert: {
          account_holder_name: string
          account_number: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          method_type: string
          support_whatsapp_number: string
          updated_at?: string
        }
        Update: {
          account_holder_name?: string
          account_number?: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          method_type?: string
          support_whatsapp_number?: string
          updated_at?: string
        }
        Relationships: []
      }
      manual_payment_proofs: {
        Row: {
          created_at: string
          id: string
          manual_payment_method_id: string
          payment_transaction_id: string
          proof_image_url: string
          sender_number: string
        }
        Insert: {
          created_at?: string
          id?: string
          manual_payment_method_id: string
          payment_transaction_id: string
          proof_image_url: string
          sender_number: string
        }
        Update: {
          created_at?: string
          id?: string
          manual_payment_method_id?: string
          payment_transaction_id?: string
          proof_image_url?: string
          sender_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "manual_payment_proofs_manual_payment_method_id_fkey"
            columns: ["manual_payment_method_id"]
            isOneToOne: false
            referencedRelation: "manual_payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_payment_proofs_payment_transaction_id_fkey"
            columns: ["payment_transaction_id"]
            isOneToOne: false
            referencedRelation: "payment_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          permissions: Json
          revoked_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          permissions?: Json
          revoked_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          permissions?: Json
          revoked_at?: string | null
        }
        Relationships: []
      }
      mcp_audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          api_key_id: string | null
          created_at: string
          id: number
          ip_address: unknown
          metadata: Json
          resource: string | null
          resource_id: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          api_key_id?: string | null
          created_at?: string
          id?: never
          ip_address?: unknown
          metadata?: Json
          resource?: string | null
          resource_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          api_key_id?: string | null
          created_at?: string
          id?: never
          ip_address?: unknown
          metadata?: Json
          resource?: string | null
          resource_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mcp_audit_logs_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "mcp_api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_oauth_clients: {
        Row: {
          client_id: string
          client_name: string
          created_at: string
          created_by: string | null
          redirect_uris: string[]
        }
        Insert: {
          client_id: string
          client_name: string
          created_at?: string
          created_by?: string | null
          redirect_uris: string[]
        }
        Update: {
          client_id?: string
          client_name?: string
          created_at?: string
          created_by?: string | null
          redirect_uris?: string[]
        }
        Relationships: []
      }
      mcp_oauth_codes: {
        Row: {
          admin_user_id: string
          client_id: string
          code_challenge: string
          code_hash: string
          expires_at: string
          redirect_uri: string
          scope: string
          used_at: string | null
        }
        Insert: {
          admin_user_id: string
          client_id: string
          code_challenge: string
          code_hash: string
          expires_at: string
          redirect_uri: string
          scope?: string
          used_at?: string | null
        }
        Update: {
          admin_user_id?: string
          client_id?: string
          code_challenge?: string
          code_hash?: string
          expires_at?: string
          redirect_uri?: string
          scope?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mcp_oauth_codes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "mcp_oauth_clients"
            referencedColumns: ["client_id"]
          },
        ]
      }
      mcp_oauth_tokens: {
        Row: {
          admin_user_id: string
          client_id: string
          expires_at: string
          revoked_at: string | null
          scope: string
          token_hash: string
        }
        Insert: {
          admin_user_id: string
          client_id: string
          expires_at: string
          revoked_at?: string | null
          scope?: string
          token_hash: string
        }
        Update: {
          admin_user_id?: string
          client_id?: string
          expires_at?: string
          revoked_at?: string | null
          scope?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcp_oauth_tokens_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "mcp_oauth_clients"
            referencedColumns: ["client_id"]
          },
        ]
      }
      mcp_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      notification_type_channels: {
        Row: {
          notification_type: string
          updated_at: string | null
          whatsapp_enabled: boolean
        }
        Insert: {
          notification_type: string
          updated_at?: string | null
          whatsapp_enabled?: boolean
        }
        Update: {
          notification_type?: string
          updated_at?: string | null
          whatsapp_enabled?: boolean
        }
        Relationships: []
      }
      notifications: {
        Row: {
          action_url: string | null
          body: string
          created_at: string
          id: string
          is_read: boolean
          read_at: string | null
          related_entity_id: string | null
          related_entity_type: string | null
          template_data: Json
          title: string
          type: string
          user_id: string
        }
        Insert: {
          action_url?: string | null
          body: string
          created_at?: string
          id?: string
          is_read?: boolean
          read_at?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          template_data?: Json
          title: string
          type: string
          user_id: string
        }
        Update: {
          action_url?: string | null
          body?: string
          created_at?: string
          id?: string
          is_read?: boolean
          read_at?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          template_data?: Json
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_eligible_students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_student_links: {
        Row: {
          admin_note: string | null
          created_at: string
          id: string
          parent_user_id: string
          relationship: string | null
          request_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          student_user_id: string
          updated_at: string
        }
        Insert: {
          admin_note?: string | null
          created_at?: string
          id?: string
          parent_user_id: string
          relationship?: string | null
          request_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          student_user_id: string
          updated_at?: string
        }
        Update: {
          admin_note?: string | null
          created_at?: string
          id?: string
          parent_user_id?: string
          relationship?: string | null
          request_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          student_user_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      payment_gateway_methods: {
        Row: {
          created_at: string
          description: string | null
          display_name: string
          gateway_id: string
          id: string
          is_enabled: boolean
          last_seen_at: string | null
          method_key: string
          order_index: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_name: string
          gateway_id: string
          id?: string
          is_enabled?: boolean
          last_seen_at?: string | null
          method_key: string
          order_index?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_name?: string
          gateway_id?: string
          id?: string
          is_enabled?: boolean
          last_seen_at?: string | null
          method_key?: string
          order_index?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_gateway_methods_gateway_id_fkey"
            columns: ["gateway_id"]
            isOneToOne: false
            referencedRelation: "payment_gateways"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_gateway_secrets: {
        Row: {
          config: Json
          created_at: string
          gateway_id: string
          id: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          gateway_id: string
          id?: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          gateway_id?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_gateway_secrets_gateway_id_fkey"
            columns: ["gateway_id"]
            isOneToOne: true
            referencedRelation: "payment_gateways"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_gateways: {
        Row: {
          created_at: string
          display_name: string
          gateway_key: string
          id: string
          is_enabled: boolean
          scope: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          gateway_key: string
          id?: string
          is_enabled?: boolean
          scope?: string
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          gateway_key?: string
          id?: string
          is_enabled?: boolean
          scope?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      payment_transactions: {
        Row: {
          amount_piastres: number
          book_order_id: string | null
          bundle_id: string | null
          course_id: string | null
          created_at: string
          discount_amount_piastres: number
          failure_reason: string | null
          gateway_id: string
          gateway_metadata: Json
          id: string
          on_behalf_of_user_id: string | null
          original_price_piastres: number | null
          purpose: string
          reference_number: string
          requires_manual_review: boolean
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          topup_amount_piastres: number | null
          user_id: string
          wallet_transaction_id: string | null
        }
        Insert: {
          amount_piastres: number
          book_order_id?: string | null
          bundle_id?: string | null
          course_id?: string | null
          created_at?: string
          discount_amount_piastres?: number
          failure_reason?: string | null
          gateway_id: string
          gateway_metadata?: Json
          id?: string
          on_behalf_of_user_id?: string | null
          original_price_piastres?: number | null
          purpose?: string
          reference_number: string
          requires_manual_review?: boolean
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status: string
          topup_amount_piastres?: number | null
          user_id: string
          wallet_transaction_id?: string | null
        }
        Update: {
          amount_piastres?: number
          book_order_id?: string | null
          bundle_id?: string | null
          course_id?: string | null
          created_at?: string
          discount_amount_piastres?: number
          failure_reason?: string | null
          gateway_id?: string
          gateway_metadata?: Json
          id?: string
          on_behalf_of_user_id?: string | null
          original_price_piastres?: number | null
          purpose?: string
          reference_number?: string
          requires_manual_review?: boolean
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          topup_amount_piastres?: number | null
          user_id?: string
          wallet_transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_transactions_book_order_id_fkey"
            columns: ["book_order_id"]
            isOneToOne: false
            referencedRelation: "book_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_gateway_id_fkey"
            columns: ["gateway_id"]
            isOneToOne: false
            referencedRelation: "payment_gateways"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "leaderboard_eligible_students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_eligible_students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_wallet_transaction_id_fkey"
            columns: ["wallet_transaction_id"]
            isOneToOne: false
            referencedRelation: "wallet_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          hero_cta_label: string | null
          hero_cta_url: string | null
          hero_headline: string | null
          hero_image_url: string | null
          hero_subtext: string | null
          id: number
          logo_dark_url: string | null
          logo_light_url: string | null
          social_links: Json
          updated_at: string
        }
        Insert: {
          hero_cta_label?: string | null
          hero_cta_url?: string | null
          hero_headline?: string | null
          hero_image_url?: string | null
          hero_subtext?: string | null
          id?: number
          logo_dark_url?: string | null
          logo_light_url?: string | null
          social_links?: Json
          updated_at?: string
        }
        Update: {
          hero_cta_label?: string | null
          hero_cta_url?: string | null
          hero_headline?: string | null
          hero_image_url?: string | null
          hero_subtext?: string | null
          id?: number
          logo_dark_url?: string | null
          logo_light_url?: string | null
          social_links?: Json
          updated_at?: string
        }
        Relationships: []
      }
      points_config: {
        Row: {
          event_key: string
          id: string
          points_value: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          event_key: string
          id?: string
          points_value?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          event_key?: string
          id?: string
          points_value?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "points_config_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "leaderboard_eligible_students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "points_config_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      points_ledger: {
        Row: {
          created_at: string
          event_key: string
          id: string
          notes: string | null
          points_delta: number
          source_id: string | null
          source_kind: string | null
          student_id: string
        }
        Insert: {
          created_at?: string
          event_key: string
          id?: string
          notes?: string | null
          points_delta: number
          source_id?: string | null
          source_kind?: string | null
          student_id: string
        }
        Update: {
          created_at?: string
          event_key?: string
          id?: string
          notes?: string | null
          points_delta?: number
          source_id?: string | null
          source_kind?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "points_ledger_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_eligible_students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "points_ledger_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      points_purchase_thresholds: {
        Row: {
          created_at: string
          id: string
          kind: string
          points_value: number
          threshold_count: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          points_value?: number
          threshold_count: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          points_value?: number
          threshold_count?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "points_purchase_thresholds_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "leaderboard_eligible_students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "points_purchase_thresholds_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          auth_email: string | null
          avatar_url: string | null
          bio: string | null
          created_at: string
          custom_fields: Json
          email: string | null
          full_name: string | null
          gender: string | null
          governorate: string | null
          guardian_phone: string | null
          id: string
          is_banned: boolean
          is_primary_admin: boolean
          last_notified_leaderboard_rank: number | null
          last_notified_level_id: string | null
          leaderboard_visible: boolean
          phone_number: string | null
          qr_token: string
          registration_type: string | null
          role: Database["public"]["Enums"]["app_role"]
          social_links: Json
          stage_id: string | null
          student_id: string | null
        }
        Insert: {
          auth_email?: string | null
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          custom_fields?: Json
          email?: string | null
          full_name?: string | null
          gender?: string | null
          governorate?: string | null
          guardian_phone?: string | null
          id: string
          is_banned?: boolean
          is_primary_admin?: boolean
          last_notified_leaderboard_rank?: number | null
          last_notified_level_id?: string | null
          leaderboard_visible?: boolean
          phone_number?: string | null
          qr_token?: string
          registration_type?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          social_links?: Json
          stage_id?: string | null
          student_id?: string | null
        }
        Update: {
          auth_email?: string | null
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          custom_fields?: Json
          email?: string | null
          full_name?: string | null
          gender?: string | null
          governorate?: string | null
          guardian_phone?: string | null
          id?: string
          is_banned?: boolean
          is_primary_admin?: boolean
          last_notified_leaderboard_rank?: number | null
          last_notified_level_id?: string | null
          leaderboard_visible?: boolean
          phone_number?: string | null
          qr_token?: string
          registration_type?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          social_links?: Json
          stage_id?: string | null
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_code_redemptions: {
        Row: {
          id: string
          purchase_code_id: string
          redeemed_at: string
          user_id: string
        }
        Insert: {
          id?: string
          purchase_code_id: string
          redeemed_at?: string
          user_id: string
        }
        Update: {
          id?: string
          purchase_code_id?: string
          redeemed_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_code_redemptions_purchase_code_id_fkey"
            columns: ["purchase_code_id"]
            isOneToOne: false
            referencedRelation: "purchase_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_code_redemptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_eligible_students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_code_redemptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_codes: {
        Row: {
          batch_id: string | null
          code: string
          created_at: string
          expires_at: string | null
          id: string
          max_uses: number
          target_id: string
          target_type: string
          updated_at: string
          use_count: number
        }
        Insert: {
          batch_id?: string | null
          code: string
          created_at?: string
          expires_at?: string | null
          id?: string
          max_uses?: number
          target_id: string
          target_type: string
          updated_at?: string
          use_count?: number
        }
        Update: {
          batch_id?: string | null
          code?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          max_uses?: number
          target_id?: string
          target_type?: string
          updated_at?: string
          use_count?: number
        }
        Relationships: []
      }
      qr_display_settings: {
        Row: {
          id: number
          show_assignment_stats: boolean
          show_avatar: boolean
          show_enrolled_courses_count: boolean
          show_enrolled_courses_list: boolean
          show_full_name: boolean
          show_phone: boolean
          show_quiz_attempts_list: boolean
          show_quiz_stats: boolean
          show_stage: boolean
          show_student_id: boolean
          show_weak_courses: boolean
          show_weak_subjects: boolean
          updated_at: string
        }
        Insert: {
          id: number
          show_assignment_stats?: boolean
          show_avatar?: boolean
          show_enrolled_courses_count?: boolean
          show_enrolled_courses_list?: boolean
          show_full_name?: boolean
          show_phone?: boolean
          show_quiz_attempts_list?: boolean
          show_quiz_stats?: boolean
          show_stage?: boolean
          show_student_id?: boolean
          show_weak_courses?: boolean
          show_weak_subjects?: boolean
          updated_at?: string
        }
        Update: {
          id?: number
          show_assignment_stats?: boolean
          show_avatar?: boolean
          show_enrolled_courses_count?: boolean
          show_enrolled_courses_list?: boolean
          show_full_name?: boolean
          show_phone?: boolean
          show_quiz_attempts_list?: boolean
          show_quiz_stats?: boolean
          show_stage?: boolean
          show_student_id?: boolean
          show_weak_courses?: boolean
          show_weak_subjects?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      quiz_answers: {
        Row: {
          answered_at: string | null
          attempt_id: string
          created_at: string
          fill_blank_text: string | null
          id: string
          is_correct: boolean | null
          option_order: Json
          points_earned: number
          question_id: string
          selected_option_ids: Json
          time_spent_seconds: number
          updated_at: string
        }
        Insert: {
          answered_at?: string | null
          attempt_id: string
          created_at?: string
          fill_blank_text?: string | null
          id?: string
          is_correct?: boolean | null
          option_order?: Json
          points_earned?: number
          question_id: string
          selected_option_ids?: Json
          time_spent_seconds?: number
          updated_at?: string
        }
        Update: {
          answered_at?: string | null
          attempt_id?: string
          created_at?: string
          fill_blank_text?: string | null
          id?: string
          is_correct?: boolean | null
          option_order?: Json
          points_earned?: number
          question_id?: string
          selected_option_ids?: Json
          time_spent_seconds?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_answers_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "quiz_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "quiz_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_attempts: {
        Row: {
          attempt_number: number
          created_at: string
          earned_points: number
          expires_at: string
          feedback: string | null
          feedback_given_at: string | null
          form_number: number
          id: string
          passed: boolean | null
          percentage: number | null
          question_order: Json
          quiz_id: string
          started_at: string
          status: string
          submitted_at: string | null
          total_points: number
          updated_at: string
          user_id: string
        }
        Insert: {
          attempt_number: number
          created_at?: string
          earned_points?: number
          expires_at: string
          feedback?: string | null
          feedback_given_at?: string | null
          form_number: number
          id?: string
          passed?: boolean | null
          percentage?: number | null
          question_order: Json
          quiz_id: string
          started_at?: string
          status?: string
          submitted_at?: string | null
          total_points?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          attempt_number?: number
          created_at?: string
          earned_points?: number
          expires_at?: string
          feedback?: string | null
          feedback_given_at?: string | null
          form_number?: number
          id?: string
          passed?: boolean | null
          percentage?: number | null
          question_order?: Json
          quiz_id?: string
          started_at?: string
          status?: string
          submitted_at?: string | null
          total_points?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_attempts_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_eligible_students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_question_options: {
        Row: {
          content: Json
          created_at: string
          id: string
          is_correct: boolean
          order_index: number
          question_id: string
        }
        Insert: {
          content: Json
          created_at?: string
          id?: string
          is_correct?: boolean
          order_index?: number
          question_id: string
        }
        Update: {
          content?: Json
          created_at?: string
          id?: string
          is_correct?: boolean
          order_index?: number
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_question_options_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "quiz_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_questions: {
        Row: {
          content: Json
          created_at: string
          form_number: number
          id: string
          image_url: string | null
          model_answer_text: string | null
          order_index: number
          points: number
          quiz_id: string
          type: string
          updated_at: string
        }
        Insert: {
          content: Json
          created_at?: string
          form_number: number
          id?: string
          image_url?: string | null
          model_answer_text?: string | null
          order_index?: number
          points: number
          quiz_id: string
          type: string
          updated_at?: string
        }
        Update: {
          content?: Json
          created_at?: string
          form_number?: number
          id?: string
          image_url?: string | null
          model_answer_text?: string | null
          order_index?: number
          points?: number
          quiz_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_questions_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      quizzes: {
        Row: {
          attempt_result_policy: string
          course_id: string
          created_at: string
          description: string | null
          duration_minutes: number
          end_at: string | null
          forms_count: number
          id: string
          max_attempts: number
          order_index: number
          pass_percentage: number
          randomize_enabled: boolean
          start_at: string | null
          title: string
          unit_id: string
          updated_at: string
        }
        Insert: {
          attempt_result_policy?: string
          course_id: string
          created_at?: string
          description?: string | null
          duration_minutes?: number
          end_at?: string | null
          forms_count?: number
          id?: string
          max_attempts?: number
          order_index?: number
          pass_percentage?: number
          randomize_enabled?: boolean
          start_at?: string | null
          title: string
          unit_id: string
          updated_at?: string
        }
        Update: {
          attempt_result_policy?: string
          course_id?: string
          created_at?: string
          description?: string | null
          duration_minutes?: number
          end_at?: string | null
          forms_count?: number
          id?: string
          max_attempts?: number
          order_index?: number
          pass_percentage?: number
          randomize_enabled?: boolean
          start_at?: string | null
          title?: string
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quizzes_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quizzes_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      registration_form_fields: {
        Row: {
          created_at: string
          field_key: string
          field_type: string
          id: string
          is_locked: boolean
          is_required: boolean
          label: string
          options: Json | null
          order_index: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          field_key: string
          field_type: string
          id?: string
          is_locked?: boolean
          is_required?: boolean
          label: string
          options?: Json | null
          order_index?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          field_key?: string
          field_type?: string
          id?: string
          is_locked?: boolean
          is_required?: boolean
          label?: string
          options?: Json | null
          order_index?: number
          updated_at?: string
        }
        Relationships: []
      }
      shipping_settings: {
        Row: {
          default_shipping_price_piastres: number
          id: number
          updated_at: string
        }
        Insert: {
          default_shipping_price_piastres?: number
          id: number
          updated_at?: string
        }
        Update: {
          default_shipping_price_piastres?: number
          id?: number
          updated_at?: string
        }
        Relationships: []
      }
      shipping_zones: {
        Row: {
          created_at: string
          id: string
          is_governorate: boolean
          name: string
          shipping_price_piastres: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_governorate?: boolean
          name: string
          shipping_price_piastres?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_governorate?: boolean
          name?: string
          shipping_price_piastres?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      stages: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          order_index: number | null
          thumbnail_url: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          order_index?: number | null
          thumbnail_url?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          order_index?: number | null
          thumbnail_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      student_badges: {
        Row: {
          awarded_at: string
          badge_id: string
          id: string
          student_id: string
        }
        Insert: {
          awarded_at?: string
          badge_id: string
          id?: string
          student_id: string
        }
        Update: {
          awarded_at?: string
          badge_id?: string
          id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_badges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_badges_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_eligible_students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_badges_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_quiz_attempt_grants: {
        Row: {
          created_at: string
          extra_attempts: number
          granted_by: string | null
          id: string
          note: string | null
          quiz_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          extra_attempts?: number
          granted_by?: string | null
          id?: string
          note?: string | null
          quiz_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          extra_attempts?: number
          granted_by?: string | null
          id?: string
          note?: string | null
          quiz_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_quiz_attempt_grants_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          thumbnail_url: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          thumbnail_url?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          thumbnail_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      testimonials: {
        Row: {
          created_at: string
          id: string
          image_url: string
          is_visible: boolean
          order_index: number
          student_name: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url: string
          is_visible?: boolean
          order_index?: number
          student_name?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string
          is_visible?: boolean
          order_index?: number
          student_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      top_up_cards: {
        Row: {
          batch_id: string | null
          code: string
          created_at: string
          expires_at: string | null
          id: string
          is_redeemed: boolean
          redeemed_at: string | null
          redeemed_by: string | null
          value_piastres: number
        }
        Insert: {
          batch_id?: string | null
          code: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_redeemed?: boolean
          redeemed_at?: string | null
          redeemed_by?: string | null
          value_piastres: number
        }
        Update: {
          batch_id?: string | null
          code?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_redeemed?: boolean
          redeemed_at?: string | null
          redeemed_by?: string | null
          value_piastres?: number
        }
        Relationships: [
          {
            foreignKeyName: "top_up_cards_redeemed_by_fkey"
            columns: ["redeemed_by"]
            isOneToOne: false
            referencedRelation: "leaderboard_eligible_students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "top_up_cards_redeemed_by_fkey"
            columns: ["redeemed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          course_id: string
          created_at: string
          description: string | null
          id: string
          position: number
          title: string
          updated_at: string
        }
        Insert: {
          course_id: string
          created_at?: string
          description?: string | null
          id?: string
          position?: number
          title: string
          updated_at?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          description?: string | null
          id?: string
          position?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "units_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      video_player_settings: {
        Row: {
          allowed_speeds: Json
          completion_gate_enabled: boolean
          completion_required_percentage: number
          double_tap_seek_enabled: boolean
          id: number
          seek_backward_seconds: number
          seek_forward_seconds: number
          speed_control_enabled: boolean
          updated_at: string
          watermark_color: string
          watermark_opacity: number
          watermark_show_email: boolean
          watermark_show_name: boolean
          watermark_speed_seconds: number
        }
        Insert: {
          allowed_speeds?: Json
          completion_gate_enabled?: boolean
          completion_required_percentage?: number
          double_tap_seek_enabled?: boolean
          id?: number
          seek_backward_seconds?: number
          seek_forward_seconds?: number
          speed_control_enabled?: boolean
          updated_at?: string
          watermark_color?: string
          watermark_opacity?: number
          watermark_show_email?: boolean
          watermark_show_name?: boolean
          watermark_speed_seconds?: number
        }
        Update: {
          allowed_speeds?: Json
          completion_gate_enabled?: boolean
          completion_required_percentage?: number
          double_tap_seek_enabled?: boolean
          id?: number
          seek_backward_seconds?: number
          seek_forward_seconds?: number
          speed_control_enabled?: boolean
          updated_at?: string
          watermark_color?: string
          watermark_opacity?: number
          watermark_show_email?: boolean
          watermark_show_name?: boolean
          watermark_speed_seconds?: number
        }
        Relationships: []
      }
      wallet_gateway_settings: {
        Row: {
          id: number
          max_wallet_balance_piastres: number
          updated_at: string
        }
        Insert: {
          id: number
          max_wallet_balance_piastres?: number
          updated_at?: string
        }
        Update: {
          id?: number
          max_wallet_balance_piastres?: number
          updated_at?: string
        }
        Relationships: []
      }
      wallet_transactions: {
        Row: {
          amount_piastres: number
          balance_after_piastres: number
          created_at: string
          id: string
          notes: string | null
          performed_by: string | null
          reference_number: string
          related_card_id: string | null
          type: string
          wallet_id: string
        }
        Insert: {
          amount_piastres: number
          balance_after_piastres: number
          created_at?: string
          id?: string
          notes?: string | null
          performed_by?: string | null
          reference_number: string
          related_card_id?: string | null
          type: string
          wallet_id: string
        }
        Update: {
          amount_piastres?: number
          balance_after_piastres?: number
          created_at?: string
          id?: string
          notes?: string | null
          performed_by?: string | null
          reference_number?: string
          related_card_id?: string | null
          type?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "leaderboard_eligible_students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_related_card_id_fkey"
            columns: ["related_card_id"]
            isOneToOne: false
            referencedRelation: "top_up_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          balance_piastres: number
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance_piastres?: number
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance_piastres?: number
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "leaderboard_eligible_students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_instances: {
        Row: {
          connection_status: string
          created_at: string | null
          id: string
          is_active: boolean
          label: string
          phone_number: string
          rasvio_instance_id: string
          updated_at: string | null
        }
        Insert: {
          connection_status?: string
          created_at?: string | null
          id?: string
          is_active?: boolean
          label: string
          phone_number: string
          rasvio_instance_id: string
          updated_at?: string | null
        }
        Update: {
          connection_status?: string
          created_at?: string | null
          id?: string
          is_active?: boolean
          label?: string
          phone_number?: string
          rasvio_instance_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      whatsapp_message_queue: {
        Row: {
          created_at: string | null
          failed_reason: string | null
          id: string
          instance_id_used: string | null
          notification_id: string | null
          notification_type: string
          phone_number: string
          rasvio_message_uuid: string | null
          rendered_body: string
          scheduled_for: string
          sent_at: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          failed_reason?: string | null
          id?: string
          instance_id_used?: string | null
          notification_id?: string | null
          notification_type: string
          phone_number: string
          rasvio_message_uuid?: string | null
          rendered_body: string
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          failed_reason?: string | null
          id?: string
          instance_id_used?: string | null
          notification_id?: string | null
          notification_type?: string
          phone_number?: string
          rasvio_message_uuid?: string | null
          rendered_body?: string
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_message_queue_instance_id_used_fkey"
            columns: ["instance_id_used"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_message_queue_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_message_queue_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_eligible_students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_message_queue_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_message_templates: {
        Row: {
          id: string
          notification_type: string
          template_text: string
          variant_index: number
        }
        Insert: {
          id?: string
          notification_type: string
          template_text: string
          variant_index: number
        }
        Update: {
          id?: string
          notification_type?: string
          template_text?: string
          variant_index?: number
        }
        Relationships: []
      }
      whatsapp_rate_limit_state: {
        Row: {
          last_sent_at: string
          phone_number: string
        }
        Insert: {
          last_sent_at: string
          phone_number: string
        }
        Update: {
          last_sent_at?: string
          phone_number?: string
        }
        Relationships: []
      }
      whatsapp_secrets: {
        Row: {
          api_key: string | null
          id: number
          updated_at: string | null
          webhook_secret: string | null
        }
        Insert: {
          api_key?: string | null
          id?: number
          updated_at?: string | null
          webhook_secret?: string | null
        }
        Update: {
          api_key?: string | null
          id?: number
          updated_at?: string | null
          webhook_secret?: string | null
        }
        Relationships: []
      }
      whatsapp_settings: {
        Row: {
          id: number
          rate_limit_max_seconds: number
          rate_limit_min_seconds: number
          updated_at: string | null
        }
        Insert: {
          id?: number
          rate_limit_max_seconds?: number
          rate_limit_min_seconds?: number
          updated_at?: string | null
        }
        Update: {
          id?: number
          rate_limit_max_seconds?: number
          rate_limit_min_seconds?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      zoom_connection_secrets: {
        Row: {
          access_token: string
          expires_at: string
          refresh_token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          expires_at: string
          refresh_token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          expires_at?: string
          refresh_token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "zoom_connection_secrets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "zoom_connections"
            referencedColumns: ["user_id"]
          },
        ]
      }
      zoom_connections: {
        Row: {
          connected_at: string
          scopes: string[]
          status: string
          updated_at: string
          user_id: string
          zoom_account_type: number | null
          zoom_display_name: string | null
          zoom_email: string | null
          zoom_user_id: string
        }
        Insert: {
          connected_at?: string
          scopes?: string[]
          status?: string
          updated_at?: string
          user_id: string
          zoom_account_type?: number | null
          zoom_display_name?: string | null
          zoom_email?: string | null
          zoom_user_id: string
        }
        Update: {
          connected_at?: string
          scopes?: string[]
          status?: string
          updated_at?: string
          user_id?: string
          zoom_account_type?: number | null
          zoom_display_name?: string | null
          zoom_email?: string | null
          zoom_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "zoom_connections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "leaderboard_eligible_students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zoom_connections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      discount_savings_summary: {
        Row: {
          created_at: string | null
          discount_amount_piastres: number | null
          kind: string | null
        }
        Relationships: []
      }
      leaderboard_eligible_students: {
        Row: {
          avatar_url: string | null
          first_earn_at: string | null
          full_name: string | null
          id: string | null
          student_id: string | null
          total_points: number | null
        }
        Relationships: []
      }
      lessons_public: {
        Row: {
          id: string | null
          position: number | null
          title: string | null
          unit_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _award_points: {
        Args: {
          p_delta_override?: number
          p_event_key: string
          p_source_id: string
          p_source_kind: string
          p_student: string
        }
        Returns: undefined
      }
      _book_effective_price: {
        Args: { p_book: Database["public"]["Tables"]["books"]["Row"] }
        Returns: number
      }
      _effective_shipping_price: {
        Args: { p_zone_id: string }
        Returns: number
      }
      _enroll_user_in_bundle: {
        Args: { _bundle_id: string; _user_id: string }
        Returns: number
      }
      _finalize_attempt: { Args: { _attempt_id: string }; Returns: undefined }
      _gen_book_order_number: { Args: never; Returns: string }
      _gen_payment_reference: { Args: never; Returns: string }
      _gen_txn_reference: { Args: never; Returns: string }
      _grade_answer: { Args: { _answer_id: string }; Returns: undefined }
      _stable_uuid: { Args: { p: string }; Returns: string }
      add_answer_time: {
        Args: { _attempt_id: string; _delta: number; _question_id: string }
        Returns: undefined
      }
      admin_adjust_wallet: {
        Args: { p_amount_piastres: number; p_type: string; p_user_id: string }
        Returns: Json
      }
      admin_approve_payment_request: {
        Args: { p_transaction_id: string }
        Returns: Json
      }
      admin_approve_refund_request: {
        Args: { p_request_id: string }
        Returns: Json
      }
      admin_bulk_adjust_wallets: {
        Args: { p_amount_piastres: number; p_type: string }
        Returns: Json
      }
      admin_complete_refund_request: {
        Args: {
          p_gateway_reference?: string
          p_notes?: string
          p_request_id: string
        }
        Returns: Json
      }
      admin_delete_expired_purchase_codes: { Args: never; Returns: number }
      admin_delete_used_purchase_codes: { Args: never; Returns: number }
      admin_finalize_not_submitted: {
        Args: { _submission_id: string }
        Returns: Json
      }
      admin_generate_top_up_cards: {
        Args: {
          p_expires_at?: string
          p_quantity: number
          p_value_piastres: number
        }
        Returns: Json
      }
      admin_get_parent_links: {
        Args: { _parent_id: string }
        Returns: {
          admin_note: string
          created_at: string
          id: string
          relationship: string
          request_note: string
          reviewed_at: string
          reviewed_by: string
          status: string
          student_code: string
          student_name: string
          student_phone: string
          student_user_id: string
          updated_at: string
        }[]
      }
      admin_get_refund_processing_context: {
        Args: { p_request_id: string }
        Returns: Json
      }
      admin_get_student: { Args: { _uid: string }; Returns: Json }
      admin_grant_quiz_attempt: {
        Args: {
          _extra?: number
          _note?: string
          _quiz_id: string
          _user_id: string
        }
        Returns: Json
      }
      admin_list_all_users: {
        Args: {
          _limit?: number
          _offset?: number
          _role?: string
          _search?: string
        }
        Returns: {
          auth_email: string
          avatar_url: string
          created_at: string
          email: string
          full_name: string
          id: string
          is_banned: boolean
          is_primary_admin: boolean
          linked_children_count: number
          phone_number: string
          student_id: string
          total_count: number
          user_role: string
        }[]
      }
      admin_list_book_orders: {
        Args: {
          p_from?: string
          p_gateway_key?: string
          p_search?: string
          p_shipping_zone_id?: string
          p_status?: string
          p_to?: string
        }
        Returns: Json
      }
      admin_list_bundles: {
        Args: never
        Returns: {
          courses_count: number
          cover_image_url: string
          created_at: string
          discount_expires_at: string
          discount_price_piastres: number
          id: string
          is_paid: boolean
          price_piastres: number
          purchases_count: number
          revenue_piastres: number
          slug: string
          status: string
          title: string
        }[]
      }
      admin_list_parent_link_requests: {
        Args: { p_status?: string }
        Returns: {
          admin_note: string
          created_at: string
          id: string
          parent_name: string
          parent_phone: string
          parent_user_id: string
          relationship: string
          request_note: string
          reviewed_at: string
          reviewed_by: string
          status: string
          student_code: string
          student_name: string
          student_user_id: string
          updated_at: string
        }[]
      }
      admin_list_parents: {
        Args: { _search?: string }
        Returns: {
          approved_children_count: number
          avatar_url: string
          created_at: string
          email: string
          full_name: string
          is_banned: boolean
          parent_user_id: string
          pending_requests_count: number
          phone_number: string
          total_requests_count: number
        }[]
      }
      admin_list_payment_requests: {
        Args: {
          _limit?: number
          _offset?: number
          _purpose?: string
          _status?: string
        }
        Returns: {
          amount_piastres: number
          course_id: string
          course_title: string
          created_at: string
          failure_reason: string
          gateway_display_name: string
          method_account_holder: string
          method_account_number: string
          method_type: string
          method_whatsapp: string
          proof_image_url: string
          purpose: string
          reference_number: string
          review_notes: string
          reviewed_at: string
          sender_number: string
          status: string
          student_name: string
          student_phone: string
          student_student_id: string
          topup_amount_piastres: number
          total_count: number
          transaction_id: string
          user_id: string
        }[]
      }
      admin_list_purchase_codes: {
        Args: {
          _limit?: number
          _offset?: number
          _search?: string
          _status?: string
        }
        Returns: {
          batch_id: string
          code: string
          created_at: string
          expires_at: string
          id: string
          max_uses: number
          status: string
          target_id: string
          target_title: string
          target_type: string
          total_count: number
          updated_at: string
          use_count: number
        }[]
      }
      admin_list_refund_requests: {
        Args: { p_search?: string; p_status?: string }
        Returns: Json
      }
      admin_list_students: {
        Args: {
          _custom_filters?: Json
          _known_filters?: Json
          _limit?: number
          _offset?: number
          _search?: string
        }
        Returns: {
          auth_email: string
          avatar_url: string
          completed_courses_count: number
          created_at: string
          custom_fields: Json
          email: string
          enrollments_count: number
          full_name: string
          gender: string
          governorate: string
          id: string
          is_banned: boolean
          phone_number: string
          registration_type: string
          stage_id: string
          stage_name: string
          student_id: string
          total_count: number
          wallet_balance_piastres: number
        }[]
      }
      admin_list_wallet_transactions: {
        Args: {
          _limit?: number
          _offset?: number
          _type?: string
          _user_search?: string
        }
        Returns: {
          amount_piastres: number
          balance_after_piastres: number
          created_at: string
          id: string
          notes: string
          performed_by: string
          performed_by_name: string
          reference_number: string
          student_id_code: string
          student_name: string
          student_phone: string
          total_count: number
          type: string
          user_id: string
          wallet_id: string
        }[]
      }
      admin_mark_refund_error: {
        Args: { p_error: string; p_request_id: string }
        Returns: Json
      }
      admin_regenerate_qr_token: { Args: { _uid: string }; Returns: string }
      admin_reject_payment_request: {
        Args: { p_reason: string; p_transaction_id: string }
        Returns: Json
      }
      admin_reject_refund_request: {
        Args: { p_notes: string; p_request_id: string }
        Returns: Json
      }
      admin_reset_all_wallets: { Args: never; Returns: Json }
      admin_review_parent_link: {
        Args: { p_action: string; p_link_id: string; p_note?: string }
        Returns: Json
      }
      admin_save_feedback: {
        Args: { _attempt_id: string; _feedback: string }
        Returns: Json
      }
      admin_save_grading: {
        Args: { _attempt_id: string; _updates: Json }
        Returns: Json
      }
      admin_student_enrollments: {
        Args: { _uid: string }
        Returns: {
          course_id: string
          course_title: string
          enrolled_at: string
          stage_name: string
          subject_name: string
        }[]
      }
      admin_trigger_whatsapp_dispatcher: { Args: never; Returns: Json }
      admin_upcoming_live_sessions: {
        Args: { _from: string; _to: string }
        Returns: {
          course_id: string
          course_thumbnail_url: string
          course_title: string
          duration_minutes: number
          host_name: string
          host_user_id: string
          id: string
          link_version: number
          scheduled_start_at: string
          status: string
          title: string
          unit_id: string
        }[]
      }
      apply_course_auto_enrollment: {
        Args: { _course_id: string }
        Returns: number
      }
      assignment_window_open: {
        Args: { _assignment_id: string }
        Returns: boolean
      }
      auto_publish_scheduled_courses: { Args: never; Returns: Json }
      award_admin_adjustment: {
        Args: { p_delta: number; p_notes: string; p_student: string }
        Returns: string
      }
      change_book_order_status:
        | {
            Args: {
              p_new_status: string
              p_notes?: string
              p_notify_student?: boolean
              p_order_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_cash_collected?: boolean
              p_new_status: string
              p_notes?: string
              p_notify_student?: boolean
              p_order_id: string
            }
            Returns: Json
          }
      check_student_level_and_rank_notifications: {
        Args: { _user_id: string }
        Returns: undefined
      }
      create_book_order: {
        Args: {
          p_gateway_key: string
          p_manual_method_id?: string
          p_manual_proof_path?: string
          p_manual_sender_number?: string
          p_shipping_address?: Json
          p_shipping_zone_id?: string
        }
        Returns: Json
      }
      create_notification: {
        Args: {
          p_action_url?: string
          p_body: string
          p_related_entity_id?: string
          p_related_entity_type?: string
          p_template_data?: Json
          p_title: string
          p_type: string
          p_user_id: string
        }
        Returns: string
      }
      create_pending_gateway_transaction: {
        Args: {
          p_course_id?: string
          p_gateway_key: string
          p_purpose: string
          p_topup_amount_piastres?: number
        }
        Returns: Json
      }
      effective_bundle_price: { Args: { _bundle_id: string }; Returns: number }
      evaluate_badge_for_all_students: {
        Args: { p_badge_id: string }
        Returns: number
      }
      evaluate_badges_for_student: {
        Args: { p_student: string }
        Returns: string[]
      }
      expire_stale_fawaterak_pending: { Args: never; Returns: number }
      finalize_gateway_transaction: {
        Args: {
          p_failure_reason?: string
          p_reference: string
          p_success: boolean
        }
        Returns: Json
      }
      get_assignment_platform_metrics: { Args: never; Returns: Json }
      get_attempt_details: { Args: { _attempt_id: string }; Returns: Json }
      get_attempt_questions: { Args: { _attempt_id: string }; Returns: Json }
      get_book_order_detail: { Args: { p_order_id: string }; Returns: Json }
      get_book_order_full: { Args: { p_order_id: string }; Returns: Json }
      get_child_snapshot: { Args: { _student_id: string }; Returns: Json }
      get_lessons_public: {
        Args: never
        Returns: {
          id: string
          position: number
          title: string
          unit_id: string
        }[]
      }
      get_live_session_join: { Args: { _session_id: string }; Returns: Json }
      get_live_session_state: { Args: { _session_id: string }; Returns: Json }
      get_most_failed_assignments: {
        Args: { _limit?: number }
        Returns: {
          assignment_id: string
          assignment_title: string
          course_id: string
          course_title: string
          failed_count: number
          failure_rate: number
          stage_id: string
          stage_name: string
          subject_id: string
          subject_name: string
          total_evaluated: number
        }[]
      }
      get_most_failed_quizzes: {
        Args: { _limit?: number }
        Returns: {
          course_id: string
          course_title: string
          failed_count: number
          quiz_id: string
          quiz_title: string
          stage_id: string
          stage_name: string
          subject_id: string
          subject_name: string
          total_official: number
        }[]
      }
      get_official_result: {
        Args: { _quiz_id: string; _user_id: string }
        Returns: Json
      }
      get_or_finalize_attempt: {
        Args: { _attempt_id: string }
        Returns: {
          attempt_number: number
          created_at: string
          earned_points: number
          expires_at: string
          feedback: string | null
          feedback_given_at: string | null
          form_number: number
          id: string
          passed: boolean | null
          percentage: number | null
          question_order: Json
          quiz_id: string
          started_at: string
          status: string
          submitted_at: string | null
          total_points: number
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "quiz_attempts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_own_payment_transaction_status: {
        Args: { p_reference: string }
        Returns: Json
      }
      get_public_instructor_profile: {
        Args: { _user_id: string }
        Returns: Json
      }
      get_question_analysis: {
        Args: { _form: number; _quiz_id: string }
        Returns: {
          content: Json
          correct_count: number
          incorrect_count: number
          order_index: number
          points: number
          question_id: string
          total_count: number
          type: string
          unanswered_count: number
        }[]
      }
      get_quiz_for_student: { Args: { _quiz_id: string }; Returns: Json }
      get_student_qr_snapshot: { Args: { _token: string }; Returns: Json }
      get_unit_quizzes: {
        Args: { _unit_id: string }
        Returns: {
          duration_minutes: number
          end_at: string
          id: string
          max_attempts: number
          order_index: number
          pass_percentage: number
          start_at: string
          title: string
          unit_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      heartbeat_quiz_attempt: {
        Args: { _attempt_id: string }
        Returns: boolean
      }
      increment_file_download: {
        Args: { p_lesson_file_id: string }
        Returns: number
      }
      is_active_parent_of: {
        Args: { _parent: string; _student: string }
        Returns: boolean
      }
      is_current_user_banned: { Args: never; Returns: boolean }
      is_enrolled_in_course: {
        Args: { _course: string; _user: string }
        Returns: boolean
      }
      is_enrolled_in_lesson_course: {
        Args: { _lesson_id: string; _user_id: string }
        Returns: boolean
      }
      leaderboard_eligible_count: { Args: never; Returns: number }
      leaderboard_public_top10: {
        Args: never
        Returns: {
          avatar_url: string
          badge_count: number
          full_name: string
          level_icon_url: string
          level_id: string
          level_name: string
          rank: number
          student_id: string
          total_points: number
        }[]
      }
      leaderboard_rank_for_student: {
        Args: { p_student: string }
        Returns: {
          rank: number
          total_students: number
        }[]
      }
      leaderboard_top: {
        Args: { p_limit: number; p_offset: number }
        Returns: {
          avatar_url: string
          first_earn_at: string
          full_name: string
          rank: number
          student_id: string
          total_points: number
        }[]
      }
      leaderboard_top_full: {
        Args: { p_limit: number; p_offset: number }
        Returns: {
          avatar_url: string
          badge_count: number
          full_name: string
          leaderboard_visible: boolean
          level_icon_url: string
          level_id: string
          level_name: string
          rank: number
          student_id: string
          total_points: number
        }[]
      }
      list_assignment_submissions:
        | {
            Args: {
              _assignment_id?: string
              _course_id?: string
              _limit?: number
              _offset?: number
              _stage_id?: string
              _subject_id?: string
              _ungraded_only?: boolean
              _user_search?: string
            }
            Returns: {
              assignment_id: string
              assignment_title: string
              computed_outcome: string
              course_id: string
              course_title: string
              end_at: string
              feedback_given_at: string
              grade: number
              graded_at: string
              has_feedback: boolean
              outcome: string
              pass_grade: number
              stage_id: string
              stage_name: string
              status: string
              student_email: string
              student_name: string
              student_phone: string
              student_student_id: string
              subject_id: string
              subject_name: string
              submission_id: string
              submitted_at: string
              total_count: number
              total_grade: number
              user_id: string
            }[]
          }
        | {
            Args: {
              _course_id?: string
              _limit?: number
              _offset?: number
              _stage_id?: string
              _subject_id?: string
              _ungraded_only?: boolean
              _user_search?: string
            }
            Returns: {
              assignment_id: string
              assignment_title: string
              computed_outcome: string
              course_id: string
              course_title: string
              end_at: string
              feedback_given_at: string
              grade: number
              graded_at: string
              has_feedback: boolean
              outcome: string
              pass_grade: number
              stage_id: string
              stage_name: string
              status: string
              student_email: string
              student_name: string
              student_phone: string
              student_student_id: string
              subject_id: string
              subject_name: string
              submission_id: string
              submitted_at: string
              total_count: number
              total_grade: number
              user_id: string
            }[]
          }
      list_my_book_orders: { Args: never; Returns: Json }
      list_my_quiz_attempts: {
        Args: { _quiz_id: string }
        Returns: {
          attempt_number: number
          created_at: string
          earned_points: number
          expires_at: string
          feedback: string | null
          feedback_given_at: string | null
          form_number: number
          id: string
          passed: boolean | null
          percentage: number | null
          question_order: Json
          quiz_id: string
          started_at: string
          status: string
          submitted_at: string | null
          total_points: number
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "quiz_attempts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_quiz_attempts:
        | {
            Args: {
              _course_id?: string
              _limit?: number
              _needs_review_only?: boolean
              _offset?: number
              _stage_id?: string
              _subject_id?: string
              _user_search?: string
            }
            Returns: {
              attempt_id: string
              attempt_number: number
              course_id: string
              course_title: string
              earned_points: number
              feedback_given_at: string
              form_number: number
              has_feedback: boolean
              pass_percentage: number
              passed: boolean
              percentage: number
              quiz_id: string
              quiz_title: string
              stage_id: string
              stage_name: string
              status: string
              student_email: string
              student_name: string
              subject_id: string
              subject_name: string
              submitted_at: string
              total_count: number
              total_points: number
              user_id: string
            }[]
          }
        | {
            Args: {
              _course_id?: string
              _limit?: number
              _needs_review_only?: boolean
              _offset?: number
              _quiz_id?: string
              _stage_id?: string
              _subject_id?: string
              _user_search?: string
            }
            Returns: {
              attempt_id: string
              attempt_number: number
              course_id: string
              course_title: string
              earned_points: number
              feedback_given_at: string
              form_number: number
              has_feedback: boolean
              pass_percentage: number
              passed: boolean
              percentage: number
              quiz_id: string
              quiz_title: string
              stage_id: string
              stage_name: string
              status: string
              student_email: string
              student_name: string
              subject_id: string
              subject_name: string
              submitted_at: string
              total_count: number
              total_points: number
              user_id: string
            }[]
          }
      live_recording_claim_next: {
        Args: never
        Returns: {
          attempts: number
          bytes_done: number
          created_at: string
          download_token: string | null
          download_url: string | null
          file_size: number | null
          id: string
          last_error: string | null
          lesson_id: string | null
          locked_until: string | null
          part_index: number | null
          part_size: number
          parts: Json
          r2_key: string | null
          recording_end: string | null
          recording_start: string | null
          recording_type: string | null
          segment_id: string | null
          session_id: string
          source: string
          status: string
          updated_at: string
          upload_id: string | null
          zoom_file_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "live_recordings"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      live_recording_ingest_tick: { Args: never; Returns: undefined }
      live_session_auto_end: { Args: never; Returns: undefined }
      live_session_dispatch_reminders: { Args: never; Returns: undefined }
      live_session_finalize: {
        Args: { _session_id: string }
        Returns: undefined
      }
      mcp_create_api_key: {
        Args: { p_name: string; p_permissions: Json; p_secret: string }
        Returns: Json
      }
      mcp_touch_api_key: { Args: { _api_key_id: string }; Returns: undefined }
      mcp_verify_api_key: {
        Args: { _key: string }
        Returns: {
          api_key_id: string
          permissions: Json
        }[]
      }
      mcp_write_audit: {
        Args: {
          _action: string
          _api_key_id?: string
          _metadata?: Json
          _resource?: string
          _resource_id?: string
        }
        Returns: number
      }
      next_unit_order_index: { Args: { _unit_id: string }; Returns: number }
      normalize_phone_e164: { Args: { p_phone: string }; Returns: string }
      notify_all_admins: {
        Args: {
          p_action_url?: string
          p_body: string
          p_related_entity_id?: string
          p_related_entity_type?: string
          p_template_data?: Json
          p_title: string
          p_type: string
        }
        Returns: number
      }
      notify_parents_of_student: {
        Args: {
          p_action_url?: string
          p_body: string
          p_related_entity_id?: string
          p_related_entity_type?: string
          p_student_id: string
          p_template_data?: Json
          p_title: string
          p_type: string
        }
        Returns: number
      }
      parent_list_children: {
        Args: never
        Returns: {
          avatar_url: string
          full_name: string
          linked_at: string
          stage_name: string
          student_id: string
          student_user_id: string
        }[]
      }
      parent_list_my_link_requests: {
        Args: never
        Returns: {
          admin_note: string
          created_at: string
          id: string
          relationship: string
          request_note: string
          reviewed_at: string
          status: string
          student_code: string
          student_name: string
          student_user_id: string
        }[]
      }
      parent_request_student_link: {
        Args: {
          p_note?: string
          p_relationship?: string
          p_student_code: string
        }
        Returns: Json
      }
      process_whatsapp_queue_batch: {
        Args: { p_batch_size?: number }
        Returns: Json
      }
      purchase_bundle: { Args: { p_bundle_id: string }; Returns: Json }
      purchase_course: {
        Args: { p_course_id: string; p_on_behalf_of?: string }
        Returns: Json
      }
      redeem_purchase_code: { Args: { p_code: string }; Returns: Json }
      redeem_top_up_card: { Args: { p_code: string }; Returns: Json }
      request_book_order_refund: {
        Args: { p_order_id: string; p_reason: string }
        Returns: Json
      }
      reset_leaderboard: { Args: never; Returns: number }
      resolve_course_lock_state: {
        Args: { _course_id: string; _user_id: string }
        Returns: {
          gate_quiz_id: string
          gate_quiz_title: string
          is_completed: boolean
          is_locked: boolean
          item_id: string
          item_type: string
          ord: number
          reason: string
          unit_id: string
        }[]
      }
      resolve_login_email: { Args: { _identifier: string }; Returns: string }
      save_points_config: { Args: { p_updates: Json }; Returns: undefined }
      save_purchase_thresholds: {
        Args: { p_kind: string; p_rows: Json }
        Returns: undefined
      }
      save_quiz_answer: {
        Args: {
          _attempt_id: string
          _fill_blank_text: string
          _question_id: string
          _selected_option_ids: Json
          _time_delta_seconds?: number
        }
        Returns: undefined
      }
      seed_sample_notifications_for_me: { Args: never; Returns: number }
      start_quiz_attempt: { Args: { _quiz_id: string }; Returns: string }
      student_condition_progress: {
        Args: {
          p_condition_type: string
          p_student: string
          p_target_int: number
          p_target_uuid: string
        }
        Returns: {
          current_value: number
          satisfied: boolean
          target_value: number
        }[]
      }
      student_current_level: {
        Args: { p_student: string }
        Returns: {
          created_at: string
          icon_url: string | null
          id: string
          min_points: number
          name: string
          order_index: number
          updated_at: string
          updated_by: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "levels"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      student_earned_badges: {
        Args: { p_student: string }
        Returns: {
          awarded_at: string
          badge_id: string
          description: string
          icon_url: string
          name: string
        }[]
      }
      student_effective_quiz_max_attempts: {
        Args: { _quiz_id: string; _user_id: string }
        Returns: number
      }
      student_list_own_payment_requests: {
        Args: never
        Returns: {
          amount_piastres: number
          course_id: string
          course_title: string
          created_at: string
          failure_reason: string
          gateway_display_name: string
          method_account_number: string
          method_type: string
          method_whatsapp: string
          proof_image_url: string
          purpose: string
          reference_number: string
          review_notes: string
          reviewed_at: string
          sender_number: string
          status: string
          topup_amount_piastres: number
          transaction_id: string
        }[]
      }
      student_next_level: {
        Args: { p_student: string }
        Returns: {
          created_at: string
          icon_url: string | null
          id: string
          min_points: number
          name: string
          order_index: number
          updated_at: string
          updated_by: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "levels"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      student_points_total: { Args: { p_student: string }; Returns: number }
      student_upcoming_live_sessions: {
        Args: { _from: string; _to: string }
        Returns: {
          course_id: string
          course_thumbnail_url: string
          course_title: string
          duration_minutes: number
          id: string
          link_version: number
          scheduled_start_at: string
          status: string
          title: string
          unit_id: string
        }[]
      }
      submit_manual_bundle_payment: {
        Args: {
          p_bundle_id: string
          p_method_id: string
          p_proof_image_url: string
          p_sender_number: string
        }
        Returns: Json
      }
      submit_manual_course_payment: {
        Args: {
          p_course_id: string
          p_method_id: string
          p_proof_image_url: string
          p_sender_number: string
        }
        Returns: Json
      }
      submit_manual_wallet_topup: {
        Args: {
          p_amount_piastres: number
          p_method_id: string
          p_proof_image_url: string
          p_sender_number: string
        }
        Returns: Json
      }
      submit_quiz_attempt: { Args: { _attempt_id: string }; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "student" | "parent"
      video_provider: "youtube" | "bunny" | "vimeo" | "r2"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["admin", "student", "parent"],
      video_provider: ["youtube", "bunny", "vimeo", "r2"],
    },
  },
} as const
