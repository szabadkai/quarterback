import { supabaseClient, hasSupabaseConfig } from './supabaseClient.js';

const STATE_TABLE = 'quarterback_states';
const PROFILE_TABLE = 'profiles';
const SHARE_TABLE = 'shared_boards';

const isReady = () => Boolean(hasSupabaseConfig() && supabaseClient);

const getSessionUser = async () => {
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) return { user: null, error };
  return { user: data?.session?.user ?? null, error: null };
};

export const SupabaseService = {
  isEnabled() {
    return isReady();
  },

  onAuthStateChange(callback) {
    if (!isReady()) return { data: null, error: new Error('Supabase not configured') };
    return supabaseClient.auth.onAuthStateChange(callback);
  },

  async signUp({ email, password, displayName }) {
    if (!isReady()) return { data: null, error: new Error('Supabase not configured') };
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
      },
    });
    return { data, error };
  },

  async signIn({ email, password }) {
    if (!isReady()) return { data: null, error: new Error('Supabase not configured') };
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    return { data, error };
  },

  async signOut() {
    if (!isReady()) return { error: new Error('Supabase not configured') };
    const { error } = await supabaseClient.auth.signOut();
    return { error };
  },

  async getSession() {
    if (!isReady()) return { data: { session: null }, error: null };
    return supabaseClient.auth.getSession();
  },

  async upsertProfile({ email, displayName }) {
    if (!isReady()) return { data: null, error: new Error('Supabase not configured') };
    const { user, error: sessionError } = await getSessionUser();
    if (sessionError || !user) return { data: null, error: sessionError || new Error('No active session') };
    const { data, error } = await supabaseClient
      .from(PROFILE_TABLE)
      .upsert({
        id: user.id,
        email,
        display_name: displayName,
      });
    return { data, error };
  },

  async fetchLatestState() {
    if (!isReady()) return { data: null, error: new Error('Supabase not configured') };
    const { user, error: sessionError } = await getSessionUser();
    if (sessionError || !user) return { data: null, error: sessionError || new Error('No active session') };
    const { data, error } = await supabaseClient
      .from(STATE_TABLE)
      .select('payload, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return { data, error };
  },

  async saveState(payload) {
    if (!isReady()) return { data: null, error: new Error('Supabase not configured') };
    const { user, error: sessionError } = await getSessionUser();
    if (sessionError || !user) return { data: null, error: sessionError || new Error('No active session') };
    const now = new Date().toISOString();
    const { data, error } = await supabaseClient
      .from(STATE_TABLE)
      .upsert({
        user_id: user.id,
        payload,
        updated_at: now,
      }, {
        onConflict: 'user_id',
      })
      .select('payload, updated_at')
      .maybeSingle();
    return { data, error };
  },

  async createSharedBoard(payload) {
    if (!isReady()) return { data: null, error: new Error('Supabase not configured') };
    const { user, error: sessionError } = await getSessionUser();
    if (sessionError || !user) return { data: null, error: sessionError || new Error('No active session') };
    try {
      const { data, error } = await supabaseClient
        .from(SHARE_TABLE)
        .insert({ owner_id: user.id, payload })
        .select('id')
        .maybeSingle();
      if (error) {
        if (error.code === '42P01' || (error.message && error.message.includes('shared_boards'))) {
          return { data: null, error: { code: 'MISSING_TABLE', message: 'shared_boards table missing' } };
        }
      }
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  async fetchSharedBoard(id) {
    if (!isReady()) return { data: null, error: new Error('Supabase not configured') };
    try {
      const { data, error } = await supabaseClient
        .from(SHARE_TABLE)
        .select('payload, created_at')
        .eq('id', id)
        .maybeSingle();
      if (error) {
        if (error.code === '42P01' || (error.message && error.message.includes('shared_boards'))) {
          return { data: null, error: { code: 'MISSING_TABLE', message: 'shared_boards table missing' } };
        }
      }
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },
};
