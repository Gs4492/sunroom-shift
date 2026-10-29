import { createClient } from '@supabase/supabase-js'

const supabaseUrl =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL
    ? import.meta.env.VITE_SUPABASE_URL
    : globalThis.process?.env?.VITE_SUPABASE_URL || ''

const supabasePublishableKey =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY
    ? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
    : globalThis.process?.env?.VITE_SUPABASE_PUBLISHABLE_KEY || ''

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabasePublishableKey || 'placeholder-key'
)
