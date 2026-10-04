export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      red7_hands: {
        Row: {
          player_id: string;
          room_id: string;
          user_id: string;
          cards: Json;
          updated_at: string;
        };
        Insert: {
          player_id: string;
          room_id: string;
          user_id: string;
          cards?: Json;
          updated_at?: string;
        };
        Update: {
          player_id?: string;
          room_id?: string;
          user_id?: string;
          cards?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      red7_players: {
        Row: {
          id: string;
          room_id: string;
          user_id: string;
          display_name: string;
          role: Database["public"]["Enums"]["red7_player_role"];
          seat: number | null;
          active: boolean;
          eliminated: boolean;
          palette: Json;
          last_seen_at: string;
          joined_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          user_id: string;
          display_name: string;
          role?: Database["public"]["Enums"]["red7_player_role"];
          seat?: number | null;
          active?: boolean;
          eliminated?: boolean;
          palette?: Json;
          last_seen_at?: string;
          joined_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          room_id?: string;
          user_id?: string;
          display_name?: string;
          role?: Database["public"]["Enums"]["red7_player_role"];
          seat?: number | null;
          active?: boolean;
          eliminated?: boolean;
          palette?: Json;
          last_seen_at?: string;
          joined_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      red7_rooms: {
        Row: {
          id: string;
          code: string;
          host_user_id: string;
          status: Database["public"]["Enums"]["red7_room_status"];
          draw_rule: boolean;
          advanced_seven: boolean;
          advanced_five: boolean;
          advanced_three: boolean;
          advanced_one: boolean;
          last_turn: Json | null;
          canvas_color: string;
          revision: number;
          winner_player_id: string | null;
          last_activity_at: string;
          expires_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          host_user_id: string;
          status?: Database["public"]["Enums"]["red7_room_status"];
          draw_rule?: boolean;
          advanced_seven?: boolean;
          advanced_five?: boolean;
          advanced_three?: boolean;
          advanced_one?: boolean;
          last_turn?: Json | null;
          canvas_color?: string;
          revision?: number;
          winner_player_id?: string | null;
          last_activity_at?: string;
          expires_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          host_user_id?: string;
          status?: Database["public"]["Enums"]["red7_room_status"];
          draw_rule?: boolean;
          advanced_seven?: boolean;
          advanced_five?: boolean;
          advanced_three?: boolean;
          advanced_one?: boolean;
          last_turn?: Json | null;
          canvas_color?: string;
          revision?: number;
          winner_player_id?: string | null;
          last_activity_at?: string;
          expires_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      red7_rounds: {
        Row: {
          room_id: string;
          deck: Json;
          turn_order: string[];
          current_player_id: string | null;
          round_number: number;
          updated_at: string;
        };
        Insert: {
          room_id: string;
          deck?: Json;
          turn_order?: string[];
          current_player_id?: string | null;
          round_number?: number;
          updated_at?: string;
        };
        Update: {
          room_id?: string;
          deck?: Json;
          turn_order?: string[];
          current_player_id?: string | null;
          round_number?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      red7_turn_events: {
        Row: {
          id: string;
          room_id: string;
          round_number: number;
          event: Json;
          created_at: string;
        };
        Insert: {
          id: string;
          room_id: string;
          round_number: number;
          event: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          room_id?: string;
          round_number?: number;
          event?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      crossword_approvals: {
        Row: {
          user_id: string;
          email: string | null;
          approved_at: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          email?: string | null;
          approved_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          email?: string | null;
          approved_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      crossword_progress: {
        Row: {
          id: string;
          user_id: string;
          crossword_id: string;
          grid_state: Json;
          elapsed_seconds: number;
          checked_count: number;
          revealed_count: number;
          completed_at: string | null;
          perfect: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          crossword_id: string;
          grid_state?: Json;
          elapsed_seconds?: number;
          checked_count?: number;
          revealed_count?: number;
          completed_at?: string | null;
          perfect?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          crossword_id?: string;
          grid_state?: Json;
          elapsed_seconds?: number;
          checked_count?: number;
          revealed_count?: number;
          completed_at?: string | null;
          perfect?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      crossword_invites: {
        Row: {
          code: string;
          email: string | null;
          created_by: string | null;
          used_by: string | null;
          expires_at: string | null;
          used_at: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          code: string;
          email?: string | null;
          created_by?: string | null;
          used_by?: string | null;
          expires_at?: string | null;
          used_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          code?: string;
          email?: string | null;
          created_by?: string | null;
          used_by?: string | null;
          expires_at?: string | null;
          used_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      flashcard_sets: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          description: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          description?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          description?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      flashcards: {
        Row: {
          id: string;
          set_id: string;
          user_id: string;
          question: string;
          answer: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          set_id: string;
          user_id: string;
          question: string;
          answer: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          set_id?: string;
          user_id?: string;
          question?: string;
          answer?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "flashcards_set_id_fkey";
            columns: ["set_id"];
            isOneToOne: false;
            referencedRelation: "flashcard_sets";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      stageselect_games: {
        Row: {
          id: string;
          igdb_id: number;
          slug: string | null;
          title: string;
          summary: string | null;
          cover_url: string | null;
          cover_storage_path: string | null;
          release_date: string | null;
          platforms: Json;
          genres: Json;
          themes: Json;
          keywords: Json;
          game_modes: Json;
          player_perspectives: Json;
          similar_game_igdb_ids: Json;
          total_rating: number | null;
          total_rating_count: number | null;
          game_type: number | null;
          recommendation_document: string | null;
          recommendation_document_hash: string | null;
          igdb_raw: Json | null;
          last_synced_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          igdb_id: number;
          slug?: string | null;
          title: string;
          summary?: string | null;
          cover_url?: string | null;
          cover_storage_path?: string | null;
          release_date?: string | null;
          platforms?: Json;
          genres?: Json;
          themes?: Json;
          keywords?: Json;
          game_modes?: Json;
          player_perspectives?: Json;
          similar_game_igdb_ids?: Json;
          total_rating?: number | null;
          total_rating_count?: number | null;
          game_type?: number | null;
          recommendation_document?: string | null;
          recommendation_document_hash?: string | null;
          igdb_raw?: Json | null;
          last_synced_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          igdb_id?: number;
          slug?: string | null;
          title?: string;
          summary?: string | null;
          cover_url?: string | null;
          cover_storage_path?: string | null;
          release_date?: string | null;
          platforms?: Json;
          genres?: Json;
          themes?: Json;
          keywords?: Json;
          game_modes?: Json;
          player_perspectives?: Json;
          similar_game_igdb_ids?: Json;
          total_rating?: number | null;
          total_rating_count?: number | null;
          game_type?: number | null;
          recommendation_document?: string | null;
          recommendation_document_hash?: string | null;
          igdb_raw?: Json | null;
          last_synced_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      stageselect_game_embeddings: {
        Row: {
          id: string;
          game_id: string;
          model: string;
          model_version: string;
          document_version: string;
          dimensions: number;
          content_hash: string;
          embedding: string | null;
          status: string;
          attempt_count: number;
          error: string | null;
          requested_at: string;
          embedded_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          game_id: string;
          model: string;
          model_version: string;
          document_version: string;
          dimensions: number;
          content_hash: string;
          embedding?: string | null;
          status?: string;
          attempt_count?: number;
          error?: string | null;
          requested_at?: string;
          embedded_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          game_id?: string;
          model?: string;
          model_version?: string;
          document_version?: string;
          dimensions?: number;
          content_hash?: string;
          embedding?: string | null;
          status?: string;
          attempt_count?: number;
          error?: string | null;
          requested_at?: string;
          embedded_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stageselect_game_embeddings_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "stageselect_games";
            referencedColumns: ["id"];
          },
        ];
      };
      stageselect_ranking_evaluations: {
        Row: {
          id: string;
          user_id: string;
          surface: string;
          model_version: string;
          baseline_variant: string;
          candidate_variant: string;
          controls: Json;
          candidate_count: number;
          comparison_key: string;
          left_variant: string;
          right_variant: string;
          left_game_igdb_ids: number[];
          right_game_igdb_ids: number[];
          choice: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          surface?: string;
          model_version: string;
          baseline_variant: string;
          candidate_variant: string;
          controls?: Json;
          candidate_count: number;
          comparison_key: string;
          left_variant: string;
          right_variant: string;
          left_game_igdb_ids: number[];
          right_game_igdb_ids: number[];
          choice: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          surface?: string;
          model_version?: string;
          baseline_variant?: string;
          candidate_variant?: string;
          controls?: Json;
          candidate_count?: number;
          comparison_key?: string;
          left_variant?: string;
          right_variant?: string;
          left_game_igdb_ids?: number[];
          right_game_igdb_ids?: number[];
          choice?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      stageselect_reviews: {
        Row: {
          id: string;
          user_id: string;
          game_id: string;
          rating: number | null;
          body: string | null;
          visibility: Database["public"]["Enums"]["stageselect_review_visibility"];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          game_id: string;
          rating?: number | null;
          body?: string | null;
          visibility?: Database["public"]["Enums"]["stageselect_review_visibility"];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          game_id?: string;
          rating?: number | null;
          body?: string | null;
          visibility?: Database["public"]["Enums"]["stageselect_review_visibility"];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stageselect_reviews_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "stageselect_games";
            referencedColumns: ["id"];
          },
        ];
      };
      stageselect_recommendation_feedback: {
        Row: {
          id: string;
          user_id: string;
          game_id: string;
          action: Database["public"]["Enums"]["stageselect_recommendation_action"];
          recommendation_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          game_id: string;
          action: Database["public"]["Enums"]["stageselect_recommendation_action"];
          recommendation_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          game_id?: string;
          action?: Database["public"]["Enums"]["stageselect_recommendation_action"];
          recommendation_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stageselect_recommendation_feedback_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "stageselect_games";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stageselect_recommendation_feedback_recommendation_id_fkey";
            columns: ["recommendation_id"];
            isOneToOne: false;
            referencedRelation: "stageselect_recommendation_impressions";
            referencedColumns: ["id"];
          },
        ];
      };
      stageselect_recommendation_impressions: {
        Row: {
          id: string;
          run_id: string;
          user_id: string;
          game_id: string;
          rank: number;
          candidate_source: string;
          final_score: number;
          score_components: Json;
          explanation_evidence: Json;
          shown_at: string;
          acted_at: string | null;
          action: Database["public"]["Enums"]["stageselect_recommendation_action"] | null;
        };
        Insert: {
          id?: string;
          run_id: string;
          user_id: string;
          game_id: string;
          rank: number;
          candidate_source: string;
          final_score: number;
          score_components?: Json;
          explanation_evidence?: Json;
          shown_at?: string;
          acted_at?: string | null;
          action?: Database["public"]["Enums"]["stageselect_recommendation_action"] | null;
        };
        Update: {
          id?: string;
          run_id?: string;
          user_id?: string;
          game_id?: string;
          rank?: number;
          candidate_source?: string;
          final_score?: number;
          score_components?: Json;
          explanation_evidence?: Json;
          shown_at?: string;
          acted_at?: string | null;
          action?: Database["public"]["Enums"]["stageselect_recommendation_action"] | null;
        };
        Relationships: [
          {
            foreignKeyName: "stageselect_recommendation_impressions_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "stageselect_games";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stageselect_recommendation_impressions_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "stageselect_recommendation_runs";
            referencedColumns: ["id"];
          },
        ];
      };
      stageselect_recommendation_outcomes: {
        Row: {
          id: string;
          user_id: string;
          impression_id: string;
          game_id: string;
          outcome: string;
          rating: number | null;
          attribution_method: string;
          occurred_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          impression_id: string;
          game_id: string;
          outcome: string;
          rating?: number | null;
          attribution_method: string;
          occurred_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          impression_id?: string;
          game_id?: string;
          outcome?: string;
          rating?: number | null;
          attribution_method?: string;
          occurred_at?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stageselect_recommendation_outcomes_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "stageselect_games";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stageselect_recommendation_outcomes_impression_id_fkey";
            columns: ["impression_id"];
            isOneToOne: false;
            referencedRelation: "stageselect_recommendation_impressions";
            referencedColumns: ["id"];
          },
        ];
      };
      stageselect_recommendation_runs: {
        Row: {
          id: string;
          user_id: string;
          model_version: string;
          feature_schema_version: string;
          candidate_generation_version: string;
          surface: string;
          controls: Json;
          candidate_count: number;
          generated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          model_version: string;
          feature_schema_version: string;
          candidate_generation_version: string;
          surface: string;
          controls?: Json;
          candidate_count: number;
          generated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          model_version?: string;
          feature_schema_version?: string;
          candidate_generation_version?: string;
          surface?: string;
          controls?: Json;
          candidate_count?: number;
          generated_at?: string;
        };
        Relationships: [];
      };
      stageselect_user_games: {
        Row: {
          id: string;
          user_id: string;
          game_id: string;
          status: Database["public"]["Enums"]["stageselect_game_status"];
          platform: string;
          started_at: string | null;
          finished_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          game_id: string;
          status: Database["public"]["Enums"]["stageselect_game_status"];
          platform?: string;
          started_at?: string | null;
          finished_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          game_id?: string;
          status?: Database["public"]["Enums"]["stageselect_game_status"];
          platform?: string;
          started_at?: string | null;
          finished_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stageselect_user_games_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "stageselect_games";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      configure_stageselect_embedding_schedule: {
        Args: { project_url: string; worker_secret: string };
        Returns: undefined;
      };
      claim_stageselect_embedding_jobs: {
        Args: { batch_size?: number };
        Returns: Array<{
          embedding_id: string;
          game_id: string;
          recommendation_document: string;
          content_hash: string;
        }>;
      };
      get_stageselect_semantic_scores: {
        Args: {
          candidate_game_ids?: string[];
          candidate_igdb_ids?: number[];
        };
        Returns: {
          game_id: string;
          igdb_id: number;
          positive_similarity: number | null;
          negative_similarity: number | null;
          positive_signal_count: number;
          negative_signal_count: number;
        }[];
      };
      invoke_stageselect_embedding_worker: {
        Args: Record<PropertyKey, never>;
        Returns: number | null;
      };
      red7_create_room: {
        Args: { display_name: string; enable_draw_rule?: boolean };
        Returns: Json;
      };
      red7_get_state: {
        Args: { room_code: string };
        Returns: Json;
      };
      red7_heartbeat: {
        Args: { room_code: string };
        Returns: Json;
      };
      red7_join_room: {
        Args: { room_code: string; display_name: string };
        Returns: Json;
      };
      red7_kick_player: {
        Args: {
          room_code: string;
          target_player_id: string;
          expected_revision: number;
        };
        Returns: Json;
      };
      red7_pass_turn: {
        Args: { room_code: string; expected_revision: number };
        Returns: Json;
      };
      red7_play_turn: {
        Args: {
          room_code: string;
          expected_revision: number;
          palette_plays?: Json;
          canvas_card?: Json | null;
        };
        Returns: Json;
      };
      red7_return_to_lobby: {
        Args: { room_code: string };
        Returns: Json;
      };
      red7_set_draw_rule: {
        Args: { room_code: string; enabled: boolean };
        Returns: Json;
      };
      red7_set_advanced_rules: {
        Args: {
          room_code: string;
          enable_seven: boolean;
          enable_five: boolean;
          enable_three: boolean;
          enable_one: boolean;
        };
        Returns: Json;
      };
      red7_start_round: {
        Args: { room_code: string };
        Returns: Json;
      };
    };
    Enums: {
      red7_player_role: "seated" | "spectator";
      red7_room_status: "lobby" | "playing" | "finished";
      stageselect_game_status:
        | "finished"
        | "left"
        | "playing"
        | "backlogged"
        | "wishlisted";
      stageselect_recommendation_action:
        | "more_like_this"
        | "not_for_me"
        | "saved"
        | "dismissed";
      stageselect_review_visibility: "private" | "public";
    };
    CompositeTypes: Record<string, never>;
  };
};

export type Tables<
  PublicTableName extends keyof Database["public"]["Tables"],
> = Database["public"]["Tables"][PublicTableName]["Row"];

export type TablesInsert<
  PublicTableName extends keyof Database["public"]["Tables"],
> = Database["public"]["Tables"][PublicTableName]["Insert"];

export type TablesUpdate<
  PublicTableName extends keyof Database["public"]["Tables"],
> = Database["public"]["Tables"][PublicTableName]["Update"];

export type Enums<
  PublicEnumName extends keyof Database["public"]["Enums"],
> = Database["public"]["Enums"][PublicEnumName];
