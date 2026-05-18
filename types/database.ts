export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          preferred_language: "en" | "he";
          beta_consent_version: string | null;
          beta_consent_accepted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          preferred_language?: "en" | "he";
          beta_consent_version?: string | null;
          beta_consent_accepted_at?: string | null;
        };
        Update: Partial<{
          email: string;
          full_name: string | null;
          preferred_language: "en" | "he";
          beta_consent_version: string | null;
          beta_consent_accepted_at: string | null;
        }>;
      };
      beta_invites: {
        Row: {
          id: string;
          email: string;
          invited_by: string | null;
          invited_at: string;
          used_at: string | null;
          notes: string | null;
        };
      };
    };
  };
};
