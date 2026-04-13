import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Validate that the URL looks like a real URL before calling createClient,
// which throws synchronously on an invalid URL and crashes the whole app.
function isValidUrl(str) {
  try {
    new URL(str)
    return true
  } catch {
    return false
  }
}

if (!isValidUrl(supabaseUrl)) {
  console.error(
    '[Supabase] VITE_SUPABASE_URL is not a valid URL:',
    supabaseUrl,
    '\nIt should look like: https://your-project-ref.supabase.co'
  )
}

export const supabase = createClient(
  isValidUrl(supabaseUrl) ? supabaseUrl : 'https://placeholder.supabase.co',
  supabaseAnonKey ?? ''
)
