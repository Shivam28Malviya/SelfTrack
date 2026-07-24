import { createClient } from '@supabase/supabase-js'

export const FILES_BUCKET = 'selftrack-files'

// Lazily initialized: this module is imported unconditionally by the
// catch-all api/[...path].js, which also handles login/signup/everything
// else. Throwing at module load (e.g. if SUPABASE_SERVICE_ROLE_KEY isn't
// set yet) would take down every route, not just Files — this project has
// been bitten by exactly that shape of bug before.
let cached = null
export function getSupabaseAdmin() {
  if (cached) return cached
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Supabase is not configured on the server (missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).')
  }
  cached = createClient(url, key, { auth: { persistSession: false } })
  return cached
}
