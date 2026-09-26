import { createClient } from "@supabase/supabase-js";

/**
 * Single Supabase client instance for the entire app.
 * Uses NEXT_PUBLIC_ env vars so it's available in client components.
 *
 * No auth / no RLS user-scoping — this is an internal tool with public read/write.
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
