import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * True only when both env vars are present. If they're missing we deliberately
 * do NOT construct a client — createClient throws on an empty URL, which would
 * crash at import time and leave the deployer staring at a blank white page.
 * App.jsx checks this flag and shows setup instructions instead.
 */
export const isConfigured = Boolean(url && anonKey)

export const supabase = isConfigured
  ? createClient(url, anonKey)
  : new Proxy(
      {},
      {
        get() {
          throw new Error(
            'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
          )
        },
      }
    )
