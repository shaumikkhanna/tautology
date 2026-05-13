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
          igdb_raw?: Json | null;
          last_synced_at?: string | null;
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
    Functions: Record<string, never>;
    Enums: {
      stageselect_game_status:
        | "finished"
        | "left"
        | "playing"
        | "backlogged"
        | "wishlisted";
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
