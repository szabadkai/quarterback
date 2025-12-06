import { createClient } from '@supabase/supabase-js';

// Support running without Vite env injection (e.g., static preview)
const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
const supabaseUrl =
  env?.VITE_SUPABASE_URL
  || (typeof window !== 'undefined' ? window.__SUPABASE_URL__ : undefined)
  || (typeof process !== 'undefined' ? process.env?.VITE_SUPABASE_URL : undefined);

const supabaseAnonKey =
  env?.VITE_SUPABASE_ANON_KEY
  || (typeof window !== 'undefined' ? window.__SUPABASE_ANON_KEY__ : undefined)
  || (typeof process !== 'undefined' ? process.env?.VITE_SUPABASE_ANON_KEY : undefined);

// Lazy singleton so callers can check for config before use.
const client = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
      },
    })
  : null;

export const hasSupabaseConfig = () => Boolean(supabaseUrl && supabaseAnonKey);
export const supabaseClient = client;
