/**
 * Hand-written `Database` type matching `supabase/schema.sql`. Nothing
 * checks this against the live database yet — keep it in sync by hand, or
 * replace with `supabase gen types typescript` once the project is linked.
 *
 * Every table needs `Relationships: []`, and the schema needs empty
 * `Views`/`Functions` — omitting them silently falls back to untyped/
 * `never` query results instead of a compile error.
 */

import type { LumoraUIMessage } from "@/lib/ai/tools";

type Role = "user" | "admin";
type Theme = "system" | "light" | "dark";

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          name: string | null;
          role: Role;
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          name?: string | null;
          role?: Role;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          name?: string | null;
          role?: Role;
          created_at?: string;
        };
        Relationships: [];
      };
      conversations: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          role: string;
          content: string | null;
          parts: LumoraUIMessage["parts"];
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          role: string;
          content?: string | null;
          parts?: LumoraUIMessage["parts"];
          created_at?: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          role?: string;
          content?: string | null;
          parts?: LumoraUIMessage["parts"];
          created_at?: string;
        };
        Relationships: [];
      };
      user_settings: {
        Row: {
          user_id: string;
          theme: Theme;
          response_style: string;
          explanation_depth: string;
          learning_focus: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          theme?: Theme;
          response_style?: string;
          explanation_depth?: string;
          learning_focus?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          theme?: Theme;
          response_style?: string;
          explanation_depth?: string;
          learning_focus?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      knowledge_nodes: {
        Row: {
          id: string;
          user_id: string;
          topic_key: string;
          label: string;
          summary: string | null;
          parent_id: string | null;
          related_labels: string[];
          activity_count: number;
          quiz_count: number;
          flashcard_count: number;
          created_at: string;
          last_studied_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          topic_key: string;
          label: string;
          summary?: string | null;
          parent_id?: string | null;
          related_labels?: string[];
          activity_count?: number;
          quiz_count?: number;
          flashcard_count?: number;
          created_at?: string;
          last_studied_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          topic_key?: string;
          label?: string;
          summary?: string | null;
          parent_id?: string | null;
          related_labels?: string[];
          activity_count?: number;
          quiz_count?: number;
          flashcard_count?: number;
          created_at?: string;
          last_studied_at?: string;
        };
        Relationships: [];
      };
      knowledge_node_positions: {
        Row: {
          node_id: string;
          user_id: string;
          position_x: number;
          position_y: number;
          position_z: number;
          updated_at: string;
        };
        Insert: {
          node_id: string;
          user_id: string;
          position_x: number;
          position_y: number;
          position_z: number;
          updated_at?: string;
        };
        Update: {
          node_id?: string;
          user_id?: string;
          position_x?: number;
          position_y?: number;
          position_z?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}
