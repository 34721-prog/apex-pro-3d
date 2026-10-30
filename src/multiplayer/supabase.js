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

export function isGoogleIdentity(user) {
  if (!user || user.is_anonymous) return false;
  const providers = user.app_metadata?.providers;
  return (
    user.app_metadata?.provider === "google" ||
    (Array.isArray(providers) && providers.includes("google"))
  );
}

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
      // PKCE over implicit grant. The implicit flow returns the access/refresh
      // tokens in the URL fragment (#access_token=...), and @supabase/auth-js
      // does NOT strip that fragment from the address bar — so the token stays
      // visible after a Google login. PKCE returns only a short-lived ?code=,
      // exchanges it server-side, and removes it from the URL automatically.
      flowType: "pkce",
    },
  });
}

// Strip Supabase auth parameters from the browser address bar. The PKCE ?code=
// query param is already removed by @supabase/auth-js, but the implicit-grant
// #access_token=... fragment is not, and an OAuth error can land as
// ?error=.../ #error=... as well. Call this once the session has already been
// read from the URL, so a token never lingers in the address bar or history.
export function cleanupAuthRedirectUrl() {
  if (typeof window === "undefined" || !window.history?.replaceState) return;
  try {
    const url = new URL(window.location.href);
    let changed = false;
    const searchKeys = [
      "access_token",
      "refresh_token",
      "provider_token",
      "provider_refresh_token",
      "expires_in",
      "expires_at",
      "token_type",
      "code",
      "state",
      "error",
      "error_description",
      "error_code",
      "sb",
    ];
    for (const key of searchKeys) {
      if (url.searchParams.has(key)) {
        url.searchParams.delete(key);
        changed = true;
      }
    }
    if (/[#&](access_token|refresh_token|provider_token|provider_refresh_token|expires_in|expires_at|token_type|code|state|error)=/i.test(url.hash)) {
      url.hash = "";
      changed = true;
    }
    if (changed) {
      window.history.replaceState(
        window.history.state,
        "",
        url.pathname + url.search + url.hash,
      );
    }
  } catch {
    // Never block boot on URL cleanup.
  }
}
