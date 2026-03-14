import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLIC_KEY!;

export const supabase = createClient("https://foecjoxoibbvuwxjwbns.supabase.co", "sb_publishable_zJzZLXy_cfLN5y-cXjTHIw_gG_JGwBw", {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
