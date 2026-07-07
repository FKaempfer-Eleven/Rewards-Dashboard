// Server-side Supabase client (service role — bypasses RLS).
// Only import this in API routes or Server Actions, never in client components.

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

let _client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (_client) return _client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      "Missing env vars: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
    )
  }
  _client = createClient(url, key, { auth: { persistSession: false } })
  return _client
}

// Convenience re-export so existing imports of `supabase` still work
export const supabase = {
  from: (...args: Parameters<SupabaseClient["from"]>) => getSupabase().from(...args),
} as unknown as SupabaseClient
