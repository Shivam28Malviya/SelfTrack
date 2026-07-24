import { createClient } from '@supabase/supabase-js'

export const FILES_BUCKET = 'selftrack-files'

// Lazily initialized so a missing VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY
// at build time only breaks the Files page when actually used, instead of
// throwing at module load and crashing every page in the app (Files.jsx is
// imported eagerly by App.jsx, not lazy-loaded).
let cached = null
export function getSupabase() {
  if (cached) return cached
  const url = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new Error('Supabase is not configured (missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')
  }
  cached = createClient(url, anonKey, { auth: { persistSession: false } })
  return cached
}
