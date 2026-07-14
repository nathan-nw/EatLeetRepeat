// Database types for the Supabase client (PRD §7 schema).
//
// Hand-written to match what `supabase gen types typescript` emits, so it can
// be regenerated/overwritten later without touching consumers. Keep in sync
// with supabase/schema.sql.

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string; // uuid, == auth.users.id
          leetcode_username: string;
          poll_slot: number; // 0-59: which minute of the hour we poll this user
          last_polled_at: string | null;
          poll_cadence: string; // hourly | daily
          verify_token: string | null; // optional ownership verification (§4.2)
          leetcode_verified_at: string | null;
          has_password: boolean; // has the user set an email/password credential
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          leetcode_username: string;
          poll_slot?: number; // DB default is a random 0-59 slot
          last_polled_at?: string | null;
          poll_cadence?: string;
          verify_token?: string | null;
          leetcode_verified_at?: string | null;
          has_password?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          leetcode_username?: string;
          poll_slot?: number;
          last_polled_at?: string | null;
          poll_cadence?: string;
          verify_token?: string | null;
          leetcode_verified_at?: string | null;
          has_password?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      submissions: {
        Row: {
          id: string;
          user_id: string; // uuid, owning profile
          title: string;
          title_slug: string;
          submitted_at: string; // timestamptz (ISO string)
          first_seen_at: string;
          source: string; // poll | import
        };
        Insert: {
          id: string;
          user_id: string;
          title: string;
          title_slug: string;
          submitted_at: string;
          first_seen_at?: string;
          source?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          title_slug?: string;
          submitted_at?: string;
          first_seen_at?: string;
          source?: string;
        };
        Relationships: [];
      };
      problems: {
        Row: {
          title_slug: string;
          frontend_id: string | null;
          title: string;
          difficulty: string | null;
          topic_tags: string[] | null;
          updated_at: string;
        };
        Insert: {
          title_slug: string;
          frontend_id?: string | null;
          title: string;
          difficulty?: string | null;
          topic_tags?: string[] | null;
          updated_at?: string;
        };
        Update: {
          title_slug?: string;
          frontend_id?: string | null;
          title?: string;
          difficulty?: string | null;
          topic_tags?: string[] | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      poll_runs: {
        Row: {
          id: number;
          user_id: string | null; // uuid; null for a whole-run/global error
          ran_at: string;
          fetched_count: number;
          new_count: number;
          status: string;
          error: string | null;
        };
        Insert: {
          id?: number;
          user_id?: string | null;
          ran_at?: string;
          fetched_count: number;
          new_count: number;
          status: string;
          error?: string | null;
        };
        Update: {
          id?: number;
          user_id?: string | null;
          ran_at?: string;
          fetched_count?: number;
          new_count?: number;
          status?: string;
          error?: string | null;
        };
        Relationships: [];
      };
      import_jobs: {
        Row: {
          id: number;
          user_id: string; // uuid, owning profile
          started_at: string;
          finished_at: string | null;
          status: string; // pending | parsing | importing | enriching | done | error
          rows_received: number | null;
          rows_accepted: number | null;
          rows_inserted: number | null;
          rows_skipped: number | null;
          error: string | null;
        };
        Insert: {
          id?: number;
          user_id: string;
          started_at?: string;
          finished_at?: string | null;
          status: string;
          rows_received?: number | null;
          rows_accepted?: number | null;
          rows_inserted?: number | null;
          rows_skipped?: number | null;
          error?: string | null;
        };
        Update: {
          id?: number;
          user_id?: string;
          started_at?: string;
          finished_at?: string | null;
          status?: string;
          rows_received?: number | null;
          rows_accepted?: number | null;
          rows_inserted?: number | null;
          rows_skipped?: number | null;
          error?: string | null;
        };
        Relationships: [];
      };
      poller_state: {
        Row: {
          id: number;
          paused_until: string | null;
          updated_at: string;
        };
        Insert: {
          id?: number;
          paused_until?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: number;
          paused_until?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

// Convenience row aliases for use across the app.
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Submission = Database['public']['Tables']['submissions']['Row'];
export type Problem = Database['public']['Tables']['problems']['Row'];
export type PollRun = Database['public']['Tables']['poll_runs']['Row'];
export type ImportJob = Database['public']['Tables']['import_jobs']['Row'];
