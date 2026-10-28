const env = import.meta.env || {};
export const supabaseConfig = Object.freeze({
  url: String(env.VITE_SUPABASE_URL || "").trim(),
  anonKey: String(env.VITE_SUPABASE_ANON_KEY || "").trim(),
  googleEnabled:
    String(env.VITE_SUPABASE_GOOGLE_ENABLED || "").toLowerCase() === "true",
});

function validSupabaseUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" ||
      (url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname))
    );
  } catch {
    return false;
  }
}

export const supabaseConfigured =
  validSupabaseUrl(supabaseConfig.url) && supabaseConfig.anonKey.length > 20;

// Only the public anon/publishable key belongs in a browser build. Keep the
// SDK out of the game bundle until a configured user opens the multiplayer page.
export async function createSupabaseClient() {
  if (!supabaseConfigured) return null;
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(supabaseConfig.url, supabaseConfig.anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });
}
