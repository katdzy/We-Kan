import { createClient } from '@supabase/supabase-js';
import { environment } from '../environments/environment';
import { safeStorage } from './safe-storage';

/**
 * Single shared Supabase client for the entire app.
 * Having one instance means both AuthService and SupabaseService
 * always operate on the same authenticated session.
 */
export const supabaseClient = createClient(environment.supabaseUrl, environment.supabaseKey, {
  auth: { storage: safeStorage },
});
