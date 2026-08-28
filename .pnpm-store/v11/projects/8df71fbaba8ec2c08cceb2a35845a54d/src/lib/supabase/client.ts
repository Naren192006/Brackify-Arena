import { createBrowserClient } from "@supabase/ssr";
import type { Session, SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseConfig } from "@/lib/supabase-config";

const { url, publishableKey } = getSupabaseConfig();

export const supabase: SupabaseClient = createBrowserClient(url, publishableKey, {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true, flowType: "pkce" },
});

export async function getCurrentSupabaseSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(`Unable to read the Supabase session: ${error.message}`);
  return data.session;
}

export async function checkSupabaseConnection(): Promise<boolean> {
  try {
    await getCurrentSupabaseSession();
    return true;
  } catch {
    return false;
  }
}
