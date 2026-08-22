/**
 * Hand-written `Database` type matching `supabase/schema.sql`.
 *
 * Nothing generates or checks this against the live database yet — once the
 * project is linked to the Supabase CLI, `supabase gen types typescript`
 * should replace this file with a generated one so it can't drift from the
 * real schema. Until then, keep this in sync by hand whenever
 * `supabase/schema.sql` changes.
 *
 * Every table includes `Relationships: []` and the schema includes empty
 * `Views`/`Functions` — required to satisfy `@supabase/postgrest-js`'s
 * `GenericTable`/`GenericSchema` constraints (a table type missing
 * `Relationships`, or a schema missing `Views`/`Functions`, silently falls
 * back to untyped/`never` query results instead of a compile error, which
 * is exactly the trap this comment exists to flag).
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
      topic_progress: {
        Row: {
          user_id: string;
          topic_id: string;
          last_studied_at: string | null;
          study_count: number;
        };
        Insert: {
          user_id: string;
          topic_id: string;
          last_studied_at?: string | null;
          study_count?: number;
        };
        Update: {
          user_id?: string;
          topic_id?: string;
          last_studied_at?: string | null;
          study_count?: number;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}
