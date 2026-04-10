import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

declare const __APP_SUPABASE_URL__: string;
declare const __APP_SUPABASE_PUBLISHABLE_KEY__: string;

export const supabase = createClient<Database>(__APP_SUPABASE_URL__, __APP_SUPABASE_PUBLISHABLE_KEY__, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});