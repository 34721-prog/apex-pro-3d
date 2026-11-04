const env = import.meta.env || {};
export const supabaseConfig = Object.freeze({
  url: String(env.VITE_SUPABASE_URL || "").trim(),
  anonKey: String(env.VITE_SUPABASE_ANON_KEY || "").trim(),
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

// A usable identity is any authenticated Supabase session — anonymous player
// identities (the default) or legacy e-mail accounts. The database gate
// (require_authenticated_user) mirrors this rule.
export function isValidSessionUser(user) {
  return !!(user && user.id && !user.deleted_at);
}

// Legacy e-mail accounts: kept working for players who already had an account.
export function isEmailConfirmed(user) {
  if (!user || user.is_anonymous) return false;
  return !!(user.email_confirmed_at || user.confirmed_at);
}

// True when the profile still has the auto-generated placeholder username and
// the player has not picked a pilot name yet.
export function isPlaceholderUsername(username) {
  return /^pilot_[0-9a-f]{8}$/.test(String(username || ""));
}

// "Manter conectado" preference: when disabled the session is kept only in
// sessionStorage, so it disappears when the tab/browser is closed.
const REMEMBER_KEY = "apex-dynasty:remember-session:v1";

export function rememberSessionEnabled() {
  try {
    return localStorage.getItem(REMEMBER_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setRememberSession(enabled) {
  try {
    if (enabled) localStorage.setItem(REMEMBER_KEY, "1");
    else localStorage.setItem(REMEMBER_KEY, "0");
  } catch {}
}

function sessionOnlyStorage() {
  const fallback = new Map();
  const wrap = (store) => ({
    getItem: (key) => {
      try {
        return store.getItem(key);
      } catch {
        return fallback.get(key) ?? null;
      }
    },
    setItem: (key, value) => {
      try {
        store.setItem(key, value);
      } catch {
        fallback.set(key, value);
      }
    },
    removeItem: (key) => {
      try {
        store.removeItem(key);
      } catch {
        fallback.delete(key);
      }
    },
  });
  try {
    return wrap(window.sessionStorage);
  } catch {
    return wrap({ getItem: () => null, setItem: () => {}, removeItem: () => {} });
  }
}

// Only the public anon/publishable key belongs in a browser build. Keep the
// SDK out of the game bundle until a configured user opens the multiplayer page.
export async function createSupabaseClient(options = {}) {
  if (!supabaseConfigured) return null;
  const { createClient } = await import("@supabase/supabase-js");
  const sessionOnly =
    typeof options.sessionOnly === "boolean"
      ? options.sessionOnly
      : !rememberSessionEnabled();
  return createClient(supabaseConfig.url, supabaseConfig.anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      // PKCE keeps tokens out of the URL fragment; e-mail confirmation and
      // password flows use short-lived ?code= exchanges that auth-js strips.
      flowType: "pkce",
      storage: sessionOnly ? sessionOnlyStorage() : undefined,
    },
  });
}

// Strip Supabase auth parameters from the browser address bar once the session
// has been read, so a token or code never lingers in the address bar/history.
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
