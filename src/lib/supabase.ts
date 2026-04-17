import { createClient } from '@supabase/supabase-js'

export const supabaseUrl            = import.meta.env.VITE_SUPABASE_URL as string
export const supabaseAnonKey        = import.meta.env.VITE_SUPABASE_ANON_KEY as string
const       supabaseServiceRoleKey  = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY as string

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Cliente admin (service role) — usado apenas para operações administrativas
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})
